import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AssistantLlmProviderStatus } from './assistant-llm-provider-status';

interface OllamaTagsResponse {
  models?: Array<{
    model?: string;
    name?: string;
  }>;
}

@Injectable()
export class OllamaProviderStatusService {
  constructor(private readonly configService: ConfigService) {}

  async getStatus(): Promise<AssistantLlmProviderStatus> {
    const baseUrl = this.configService.get<string>('OLLAMA_BASE_URL', 'http://host.docker.internal:11434');
    const model = this.configService.get<string>('OLLAMA_MODEL', 'gemma3:1b');
    const timeoutMs = Number.parseInt(
      this.configService.get<string>('OLLAMA_TIMEOUT_MS', '360000'),
      10,
    );

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
      const hasModel = (body.models ?? []).some(
        (entry) => entry.name === model || entry.model === model,
      );

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
