import { Injectable, OnModuleInit } from '@nestjs/common';
import type { AssistantLlmProviderStatus } from '../contracts/assistant-llm';
import { STATIC_PROVIDER_MODELS } from '../contracts/assistant-llm-model-catalog';
import { AssistantLlmConfigService } from './assistant-llm-config.service';

interface OllamaTagsResponse {
  models?: Array<{
    model?: string;
    name?: string;
  }>;
}

interface OllamaModelAvailability {
  models: string[];
  enabled: boolean;
}

@Injectable()
export class OllamaProviderStatusService implements OnModuleInit {
  private availableModelsSnapshot = new Set<string>();
  private enabledModelsSnapshot = new Set<string>();

  constructor(private readonly assistantLlmConfigService: AssistantLlmConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.refreshSnapshots();
  }

  getAvailableModelsSnapshot(): string[] {
    return [...this.availableModelsSnapshot];
  }

  getEnabledModelsSnapshot(): string[] {
    return [...this.enabledModelsSnapshot];
  }

  async refreshSnapshots(): Promise<void> {
    const availability = await this.listAvailableModels();
    this.availableModelsSnapshot = new Set(availability.models);
    this.enabledModelsSnapshot = new Set(
      availability.models.filter((model) => STATIC_PROVIDER_MODELS.ollama.includes(model)),
    );
  }

  async listAvailableModels(): Promise<OllamaModelAvailability> {
    const config = await this.assistantLlmConfigService.read();
    try {
      const response = await fetch(`${config.ollama_base_url}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(config.ollama_timeout_ms),
      });
      if (!response.ok) {
        return { enabled: false, models: [] };
      }
      const body = (await response.json()) as OllamaTagsResponse;
      return {
        models: [
          ...new Set(
            (body.models ?? [])
              .flatMap((entry) => [entry.name, entry.model])
              .filter((value): value is string => Boolean(value && value.trim())),
          ),
        ],
        enabled: true,
      };
    } catch {
      return { enabled: false, models: [] };
    }
  }

  async downloadModel(model: string): Promise<void> {
    const config = await this.assistantLlmConfigService.read();
    const response = await fetch(`${config.ollama_base_url}/api/pull`, {
      body: JSON.stringify({
        name: model,
        stream: false,
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(config.ollama_timeout_ms),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ollama pull failed with ${response.status}: ${body}`);
    }

    await response.text();
    await this.refreshSnapshots();
  }

  async getStatus(): Promise<AssistantLlmProviderStatus> {
    const config = await this.assistantLlmConfigService.read();
    const model = config.provider === 'ollama' ? config.model : 'qwen3:1.7b';
    const availability = await this.listAvailableModels();
    const hasModel = availability.models.includes(model);
    const supportsTools = STATIC_PROVIDER_MODELS.ollama.includes(model);

    return {
      enabled: availability.enabled && hasModel && supportsTools,
      model,
      provider: 'ollama',
      status: availability.enabled && hasModel && supportsTools
        ? 'ok'
        : availability.enabled && hasModel
          ? `Ollama model ${model} does not support native tool calling`
        : availability.enabled
          ? `Ollama is reachable, but model ${model} is not available locally`
          : 'Ollama API is not reachable',
    };
  }
}
