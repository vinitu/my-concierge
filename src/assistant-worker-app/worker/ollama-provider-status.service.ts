import { Injectable } from '@nestjs/common';
import type { AssistantLlmProviderStatus } from './assistant-llm-provider-status';
import { AssistantWorkerConfigService } from './assistant-worker-config.service';

interface OllamaTagsResponse {
  models?: Array<{
    model?: string;
    name?: string;
  }>;
}

@Injectable()
export class OllamaProviderStatusService {
  constructor(private readonly assistantWorkerConfigService: AssistantWorkerConfigService) {}

  async listAvailableModels(): Promise<string[]> {
    const config = await this.assistantWorkerConfigService.read();
    const baseUrl = config.ollama_base_url;
    const timeoutMs = config.ollama_timeout_ms;

    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        return [];
      }

      const body = (await response.json()) as OllamaTagsResponse;
      const models = (body.models ?? [])
        .flatMap((entry) => [entry.name, entry.model])
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

      return [...new Set(models)];
    } catch {
      return [];
    }
  }

  async getStatus(): Promise<AssistantLlmProviderStatus> {
    const config = await this.assistantWorkerConfigService.read();
    const baseUrl = config.ollama_base_url;
    const model = config.provider === 'ollama' ? config.model : 'gemma3:1b';
    const timeoutMs = config.ollama_timeout_ms;

    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const body = await response.text();

        return {
          apiKeyConfigured: null,
          message: `Ollama check failed with ${response.status}: ${body}`,
          model,
          provider: 'ollama',
          reachable: false,
          status: 'error',
        };
      }

      const body = (await response.json()) as OllamaTagsResponse;
      const hasModel = (body.models ?? []).some((entry) => entry.name === model || entry.model === model);

      if (!hasModel) {
        return {
          apiKeyConfigured: null,
          message: `Ollama is reachable, but model ${model} is not available locally`,
          model,
          provider: 'ollama',
          reachable: false,
          status: 'error',
        };
      }

      return {
        apiKeyConfigured: null,
        message: 'Ollama API is reachable and the configured model is available',
        model,
        provider: 'ollama',
        reachable: true,
        status: 'ready',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown Ollama error';

      return {
        apiKeyConfigured: null,
        message: `Ollama check failed: ${message}`,
        model,
        provider: 'ollama',
        reachable: false,
        status: 'error',
      };
    }
  }
}
