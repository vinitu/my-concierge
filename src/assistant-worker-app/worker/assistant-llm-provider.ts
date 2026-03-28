import type { MemoryEntry } from '../../contracts/assistant-memory';
import type { ExecutionJob } from '../../contracts/assistant-transport';
import type {
  AssistantConversationState,
} from './assistant-worker-conversation.service';
import type { AssistantLlmGenerateResult } from './assistant-llm-response-parser';

export type AssistantWorkerProvider = 'deepseek' | 'ollama' | 'xai';

export interface AssistantLlmGenerateInput {
  conversation: AssistantConversationState;
  message: ExecutionJob;
  retrieved_memory: MemoryEntry[];
}

export interface AssistantLlmProvider {
  generateText(prompt: string): Promise<string>;
}

export const ASSISTANT_LLM_PROVIDER = Symbol('ASSISTANT_LLM_PROVIDER');
