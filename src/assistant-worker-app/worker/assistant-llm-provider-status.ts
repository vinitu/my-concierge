import type { AssistantWorkerProvider } from './assistant-llm-provider';

export interface AssistantLlmProviderStatus {
  apiKeyConfigured: boolean | null;
  message: string;
  model: string;
  provider: AssistantWorkerProvider;
  reachable: boolean;
  status: 'error' | 'missing_key' | 'ready';
}
