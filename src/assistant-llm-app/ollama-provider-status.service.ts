import { Injectable } from '@nestjs/common';
import type { AssistantLlmProviderStatus } from '../contracts/assistant-llm';
import { AssistantLlmConfigService } from './assistant-llm-config.service';

interface OllamaTagsResponse {
  models?: Array<{
    model?: string;
    name?: string;
  }>;
}

@Injectable()
export class OllamaProviderStatusService {
  constructor(private readonly assistantLlmConfigService: AssistantLlmConfigService) {}

  async listAvailableModels(): Promise<string[]> {
    const config = await this.assistantLlmConfigService.read();
    try {
      const response = await fetch(`${config.ollama_base_url}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(config.ollama_timeout_ms),
      });
      if (!response.ok) {
        return [];
      }
      const body = (await response.json()) as OllamaTagsResponse;
      return [
        ...new Set(
          (body.models ?? [])
            .flatMap((entry) => [entry.name, entry.model])
            .filter((value): value is string => Boolean(value && value.trim())),
        ),
      ];
    } catch {
      return [];
    }
  }

  async getStatus(): Promise<AssistantLlmProviderStatus> {
    const config = await this.assistantLlmConfigService.read();
    const model = config.provider === 'ollama' ? config.model : 'qwen3:1.7b';
    const available = await this.listAvailableModels();
    const hasModel = available.includes(model);

    return {
      apiKeyConfigured: null,
      message: hasModel
        ? 'Ollama API is reachable and configured model is available'
        : `Ollama is reachable, but model ${model} is not available locally`,
      model,
      provider: 'ollama',
      reachable: hasModel,
      status: hasModel ? 'ready' : 'error',
    };
  }
}
