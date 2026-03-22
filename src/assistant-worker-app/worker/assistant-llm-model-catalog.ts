import type { AssistantWorkerProvider } from './assistant-llm-provider';

export const STATIC_PROVIDER_MODELS: Record<AssistantWorkerProvider, string[]> = {
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  ollama: ['gemma3:1b'],
  xai: ['grok-4', 'grok-4-latest'],
};

export function defaultModelForProvider(provider: AssistantWorkerProvider): string {
  return STATIC_PROVIDER_MODELS[provider][0];
}
