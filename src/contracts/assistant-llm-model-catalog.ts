import type { AssistantLlmProvider } from './assistant-llm';

export const STATIC_PROVIDER_MODELS: Record<AssistantLlmProvider, string[]> = {
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  ollama: ['qwen3:1.7b', 'llama3.2:3b', 'hermes3:3b'],
  xai: ['grok-4', 'grok-4-latest'],
};

export function defaultModelForProvider(provider: AssistantLlmProvider): string {
  return STATIC_PROVIDER_MODELS[provider][0];
}
