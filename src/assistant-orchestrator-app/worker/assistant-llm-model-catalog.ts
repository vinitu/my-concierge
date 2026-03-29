import type { AssistantOrchestratorProvider } from './assistant-llm-provider';

export const STATIC_PROVIDER_MODELS: Record<AssistantOrchestratorProvider, string[]> = {
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  ollama: ['gemma3:1b', 'gemma3:4b', 'gemma3:12b'],
  xai: ['grok-4', 'grok-4-latest'],
};

export function defaultModelForProvider(provider: AssistantOrchestratorProvider): string {
  return STATIC_PROVIDER_MODELS[provider][0];
}
