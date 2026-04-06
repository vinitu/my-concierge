import { Injectable } from '@nestjs/common';
import type { AssistantLlmGenerateInput } from './assistant-llm-provider';
import { assistantPlanningOutputParser } from './assistant-llm-output-schema';
import {
  type AssistantToolDescriptor,
  type AssistantToolName,
  AssistantToolCatalogService,
} from './assistant-tool-catalog.service';
import type { AssistantOrchestratorRuntimeContext } from './assistant-orchestrator-runtime-context.service';
import type { AssistantToolObservation } from './assistant-tool-dispatcher.service';

@Injectable()
export class AssistantOrchestratorPromptService {
  constructor(private readonly toolCatalogService: AssistantToolCatalogService) {}

  buildAgentsSection(runtimeContext: AssistantOrchestratorRuntimeContext): string {
    return runtimeContext.agents?.trim() ?? '';
  }

  buildSoulSection(runtimeContext: AssistantOrchestratorRuntimeContext): string {
    return runtimeContext.soul?.trim() ?? '';
  }

  buildIdentitySection(runtimeContext: AssistantOrchestratorRuntimeContext): string {
    return runtimeContext.identity?.trim() ?? '';
  }

  buildConversationContextSection(input: AssistantLlmGenerateInput): string {
    return input.conversation.context.trim() || '(empty)';
  }

  buildConversationContextJsonSection(input: AssistantLlmGenerateInput): string {
    return JSON.stringify(this.buildConversationContextSection(input));
  }

  buildRecentMessagesSection(input: AssistantLlmGenerateInput): string {
    if (input.conversation.messages.length === 0) {
      return '[]';
    }

    return JSON.stringify(input.conversation.messages, null, 2);
  }

  buildRetrievedMemorySection(input: AssistantLlmGenerateInput): string {
    if (input.retrieved_memory.length === 0) {
      return '[]';
    }

    return JSON.stringify(input.retrieved_memory, null, 2);
  }

  buildCurrentUserMessageSection(input: AssistantLlmGenerateInput): string {
    return JSON.stringify(
      {
        chat: input.message.chat,
        user_id: input.message.user_id || input.message.contact || 'default-user',
        direction: input.message.direction,
        message: input.message.message,
      },
      null,
      2,
    );
  }

  buildAvailableToolsSection(enabledTools?: AssistantToolName[]): string {
    return JSON.stringify(this.toolCatalogService.listTools(enabledTools), null, 2);
  }

  listAvailableTools(enabledTools?: AssistantToolName[]): AssistantToolDescriptor[] {
    return this.toolCatalogService.listTools(enabledTools);
  }

  buildRequestSection(
    input: AssistantLlmGenerateInput,
    runtimeContext: AssistantOrchestratorRuntimeContext,
    enabledTools?: AssistantToolName[],
    toolObservations?: AssistantToolObservation[],
  ): string {
    const systemInstructions = this.parseInstructions(runtimeContext.agents);

    return JSON.stringify(
      {
        tools: this.toolCatalogService.listTools(enabledTools),
        conversation_context: this.buildConversationContextSection(input),
        retrieved_memory: input.retrieved_memory,
        tool_observations: toolObservations ?? [],
        system_instructions: systemInstructions,
        task: [
          'Answer as the assistant inside the dialogue.',
          'The full dialogue history is provided as chat messages outside this JSON payload.',
          'The current user turn is provided as the latest user chat message outside this JSON payload.',
          'Preserve continuity with the conversation history, retrieved memory, and context.',
          'Use runtime instructions, retrieved memory, and conversation context when relevant.',
          'Update the compact conversation context for future turns.',
          'Keep the context short, useful, and reusable.',
          'Keep stable user facts when they matter.',
          'Keep the active conversation topic when it matters.',
          'Keep important entities, decisions, preferences, and unresolved questions when they matter.',
          'Prefer the documented tool catalog when external actions or retrieval are needed.',
          'Drop greetings, filler, repeated wording, gibberish, and temporary noise from the context.',
          'Do not reduce the context to language preference only when there is a more important active topic.',
          'If the dialogue is about a person, place, task, or problem, keep that active topic in the context.',
          'If there is nothing new to keep, return the existing context or an empty string.',
        ],
      },
      null,
      2,
    );
  }

  private parseInstructions(raw: string | null): string[] {
    if (!raw) {
      return [];
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((entry): entry is string => typeof entry === 'string');
      }
      if (typeof parsed === 'string' && parsed.trim()) {
        return [parsed.trim()];
      }
    } catch {
      return trimmed
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    }

    return [];
  }

  buildPlanningPrompt(
    input: AssistantLlmGenerateInput,
    runtimeContext: AssistantOrchestratorRuntimeContext,
    enabledTools?: AssistantToolName[],
    toolObservations?: AssistantToolObservation[],
  ): string {
    return [
      'You are the assistant runtime agent loop.',
      'Follow the structured output schema exactly.',
      'Tools remain available until you can produce the final answer.',
      'If no tool is needed, return type=final with message/context.',
      'If another tool is needed, return type=tool_call with tool_name/tool_arguments.',
      'Use type=error only when request cannot be processed safely.',
      'Use prior tool_observations when they are enough to answer; do not call another tool unnecessarily.',
      'Do not output any explanatory text outside the JSON object.',
      '',
      assistantPlanningOutputParser.getFormatInstructions(),
      '',
      this.buildRequestSection(input, runtimeContext, enabledTools, toolObservations),
    ].join('\n');
  }

  buildRepeatedToolRepairPrompt(
    input: AssistantLlmGenerateInput,
    repeatedToolCall: {
      arguments: Record<string, unknown>;
      name: AssistantToolName;
    },
    repeatedToolObservation: AssistantToolObservation,
  ): string {
    return [
      'You are repairing an invalid assistant runtime step.',
      'The previous assistant output repeated a tool call that has already succeeded.',
      'Do not return the same tool call again.',
      'Do not request any tool in this repair step.',
      'Return JSON only.',
      'For this repair step, return only type=final or type=error.',
      'message must be non-empty.',
      'context may be empty.',
      'memory_writes and tool_observations must be arrays when present.',
      '',
      JSON.stringify(
        {
          conversation_context: this.buildConversationContextSection(input),
          latest_user_message: input.message.message,
          repeated_tool_call: repeatedToolCall,
          successful_tool_observation: repeatedToolObservation,
        },
        null,
        2,
      ),
    ].join('\n');
  }
}
