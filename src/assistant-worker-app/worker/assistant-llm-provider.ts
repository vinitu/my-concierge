import type { QueueMessage } from '../../assistant-api-app/queue/queue-adapter';

export interface AssistantLlmProvider {
  generateReply(message: QueueMessage): Promise<string>;
  modelName(): string;
  providerName(): string;
}

export const ASSISTANT_LLM_PROVIDER = Symbol('ASSISTANT_LLM_PROVIDER');
