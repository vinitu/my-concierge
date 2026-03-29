import type { MemoryEntry } from '../../contracts/assistant-memory';
import type {
  AssistantLlmMessage as SharedAssistantLlmMessage,
  AssistantLlmProvider as SharedAssistantLlmProvider,
} from '../../contracts/assistant-llm';
import type { ExecutionJob } from '../../contracts/assistant-transport';
import type {
  AssistantConversationState,
} from './assistant-orchestrator-conversation.service';
import type { AssistantLlmGenerateResult } from './assistant-llm-output-schema';

export type AssistantOrchestratorProvider = SharedAssistantLlmProvider;

export interface AssistantLlmGenerateInput {
  conversation: AssistantConversationState;
  message: ExecutionJob;
  retrieved_memory: MemoryEntry[];
}

export type AssistantLlmMessage = SharedAssistantLlmMessage;

export interface AssistantLlmProvider {
  generateFromMessages(messages: AssistantLlmMessage[]): Promise<string>;
  summarizeConversation(
    messages: AssistantLlmMessage[],
    previousContext: string,
  ): Promise<string>;
}

export const ASSISTANT_LLM_PROVIDER = Symbol('ASSISTANT_LLM_PROVIDER');
