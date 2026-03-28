import type { MemoryEntry } from '../../contracts/assistant-memory';
import type { ExecutionJob } from '../../contracts/assistant-transport';
import type {
  AssistantConversationState,
} from './assistant-worker-conversation.service';
import type { AssistantLlmGenerateResult } from './assistant-llm-output-schema';

export type AssistantWorkerProvider = 'deepseek' | 'ollama' | 'xai';

export interface AssistantLlmGenerateInput {
  conversation: AssistantConversationState;
  message: ExecutionJob;
  retrieved_memory: MemoryEntry[];
}

export interface AssistantLlmMessage {
  content: string;
  role: 'assistant' | 'system' | 'user';
}

export interface AssistantLlmProvider {
  generateFromMessages(messages: AssistantLlmMessage[]): Promise<string>;
  summarizeConversation(
    messages: AssistantLlmMessage[],
    previousContext: string,
  ): Promise<string>;
}

export const ASSISTANT_LLM_PROVIDER = Symbol('ASSISTANT_LLM_PROVIDER');
