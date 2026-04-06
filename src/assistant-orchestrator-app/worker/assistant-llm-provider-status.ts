import type { AssistantOrchestratorProvider } from './assistant-llm-provider';

export interface AssistantLlmProviderStatus {
  enabled: boolean;
  model: string;
  provider: AssistantOrchestratorProvider;
  status: string;
}
