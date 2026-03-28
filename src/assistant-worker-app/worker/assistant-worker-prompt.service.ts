import { Injectable } from '@nestjs/common';
import type { AssistantLlmGenerateInput } from './assistant-llm-provider';
import {
  assistantPlanningOutputParser,
  assistantSynthesisOutputParser,
} from './assistant-llm-output-schema';
import {
  type AssistantToolName,
  AssistantToolCatalogService,
} from './assistant-tool-catalog.service';
import type { AssistantWorkerRuntimeContext } from './assistant-worker-runtime-context.service';
import type { AssistantToolObservation } from './assistant-tool-dispatcher.service';

@Injectable()
export class AssistantWorkerPromptService {
  constructor(private readonly toolCatalogService: AssistantToolCatalogService) {}

  buildAgentsSection(runtimeContext: AssistantWorkerRuntimeContext): string {
    return runtimeContext.agents?.trim() ?? '';
  }

  buildSoulSection(runtimeContext: AssistantWorkerRuntimeContext): string {
    return runtimeContext.soul?.trim() ?? '';
  }

  buildIdentitySection(runtimeContext: AssistantWorkerRuntimeContext): string {
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
        contact: input.message.contact,
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

  buildRequestSection(
    input: AssistantLlmGenerateInput,
    runtimeContext: AssistantWorkerRuntimeContext,
    enabledTools?: AssistantToolName[],
  ): string {
    return JSON.stringify(
      {
        behavior: runtimeContext.soul ? JSON.parse(runtimeContext.soul) : [],
        available_tools: this.toolCatalogService.listTools(enabledTools),
        conversation_context: this.buildConversationContextSection(input),
        current_user_message: {
          chat: input.message.chat,
          contact: input.message.contact,
          direction: input.message.direction,
          message: input.message.message,
        },
        identity: runtimeContext.identity ? JSON.parse(runtimeContext.identity) : [],
        retrieved_memory: input.retrieved_memory,
        recent_messages: input.conversation.messages,
        system_instructions: runtimeContext.agents ? JSON.parse(runtimeContext.agents) : [],
        task: [
          'Answer as the assistant inside the dialogue.',
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

  buildPlanningPrompt(
    input: AssistantLlmGenerateInput,
    runtimeContext: AssistantWorkerRuntimeContext,
    enabledTools?: AssistantToolName[],
  ): string {
    return [
      'You are the planning phase of the assistant runtime.',
      'Follow the structured output schema exactly.',
      'If no tool is needed, populate final with the assistant reply.',
      'If one tool is needed, populate tool_call and leave final absent.',
      'Do not output any explanatory text outside the JSON object.',
      '',
      assistantPlanningOutputParser.getFormatInstructions(),
      '',
      this.buildRequestSection(input, runtimeContext, enabledTools),
    ].join('\n');
  }

  buildSynthesisPrompt(
    input: AssistantLlmGenerateInput,
    runtimeContext: AssistantWorkerRuntimeContext,
    observation: AssistantToolObservation,
    enabledTools?: AssistantToolName[],
  ): string {
    return [
      'You are the synthesis phase of the assistant runtime.',
      'Follow the structured output schema exactly.',
      'Use the tool observation when helpful.',
      'Keep memory_writes empty unless there is stable durable memory to persist.',
      'Do not output any explanatory text outside the JSON object.',
      '',
      assistantSynthesisOutputParser.getFormatInstructions(),
      '',
      this.buildRequestSection(input, runtimeContext, enabledTools),
      '',
      'tool_observation:',
      JSON.stringify(observation, null, 2),
    ].join('\n');
  }
}
