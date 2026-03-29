import type { AssistantLlmProvider } from '../contracts/assistant-llm';

export const STATIC_PROVIDER_MODELS: Record<AssistantLlmProvider, string[]> = {
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  ollama: ['qwen3:1.7b', 'gemma3:1b', 'gemma3:4b', 'gemma3:12b'],
  xai: ['grok-4', 'grok-4-latest'],
};

export function defaultModelForProvider(provider: AssistantLlmProvider): string {
  return STATIC_PROVIDER_MODELS[provider][0];
}
