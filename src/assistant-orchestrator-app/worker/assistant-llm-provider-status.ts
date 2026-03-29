import type { AssistantOrchestratorProvider } from './assistant-llm-provider';

export interface AssistantLlmProviderStatus {
  apiKeyConfigured: boolean | null;
  message: string;
  model: string;
  provider: AssistantOrchestratorProvider;
  reachable: boolean;
  status: 'error' | 'missing_key' | 'ready';
}
