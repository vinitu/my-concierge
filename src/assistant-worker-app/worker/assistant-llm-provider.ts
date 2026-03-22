import type { QueueMessage } from '../../assistant-api-app/queue/queue-adapter';

export type AssistantWorkerProvider = 'ollama' | 'xai';

export interface AssistantLlmProvider {
  generateReply(message: QueueMessage): Promise<string>;
}

export const ASSISTANT_LLM_PROVIDER = Symbol('ASSISTANT_LLM_PROVIDER');
