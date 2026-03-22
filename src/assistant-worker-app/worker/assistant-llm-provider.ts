import type { QueueMessage } from '../../assistant-api-app/queue/queue-adapter';
import type {
  AssistantConversationState,
} from './assistant-worker-conversation.service';
import type { AssistantLlmGenerateResult } from './assistant-llm-response-parser';

export type AssistantWorkerProvider = 'deepseek' | 'ollama' | 'xai';

export interface AssistantLlmGenerateInput {
  conversation: AssistantConversationState;
  message: QueueMessage;
}

export interface AssistantLlmProvider {
  generateReply(input: AssistantLlmGenerateInput): Promise<AssistantLlmGenerateResult>;
}

export const ASSISTANT_LLM_PROVIDER = Symbol('ASSISTANT_LLM_PROVIDER');
