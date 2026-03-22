import { Injectable } from '@nestjs/common';
import type { AssistantLlmGenerateInput } from './assistant-llm-provider';
import type { AssistantWorkerRuntimeContext } from './assistant-worker-runtime-context.service';

@Injectable()
export class AssistantWorkerPromptService {
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

  buildRequestSection(
    input: AssistantLlmGenerateInput,
    runtimeContext: AssistantWorkerRuntimeContext,
  ): string {
    return JSON.stringify(
      {
        behavior: runtimeContext.soul ? JSON.parse(runtimeContext.soul) : [],
        conversation_context: this.buildConversationContextSection(input),
        current_user_message: {
          chat: input.message.chat,
          contact: input.message.contact,
          direction: input.message.direction,
          message: input.message.message,
        },
        identity: runtimeContext.identity ? JSON.parse(runtimeContext.identity) : [],
        recent_messages: input.conversation.messages,
        system_instructions: runtimeContext.agents ? JSON.parse(runtimeContext.agents) : [],
        task: [
          'Answer as the assistant inside the dialogue.',
          'Preserve continuity with the conversation history and context.',
          'Use runtime instructions and conversation context when relevant.',
          'Update the compact conversation context for future turns.',
          'Keep the context short, useful, and reusable.',
          'Keep stable user facts when they matter.',
          'Keep the active conversation topic when it matters.',
          'Keep important entities, decisions, preferences, and unresolved questions when they matter.',
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
}
