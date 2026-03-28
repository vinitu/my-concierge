import { Injectable } from '@nestjs/common';
import type { AssistantLlmProviderStatus } from './assistant-llm-provider-status';
import { AssistantWorkerConfigService } from './assistant-worker-config.service';

@Injectable()
export class XaiProviderStatusService {
  constructor(private readonly assistantWorkerConfigService: AssistantWorkerConfigService) {}

  async getStatus(): Promise<AssistantLlmProviderStatus> {
    const config = await this.assistantWorkerConfigService.read();
    const apiKey = config.xai_api_key.trim();
    const model = config.provider === 'xai' ? config.model : 'grok-4';

    if (!apiKey) {
      return {
        apiKeyConfigured: false,
        message: 'xAI API key is not configured in assistant-worker web settings',
        model,
        provider: 'xai',
        reachable: false,
        status: 'missing_key',
      };
    }

    const baseUrl = config.xai_base_url;
    const timeoutMs = config.xai_timeout_ms;

    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        method: 'GET',
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const body = await response.text();

        return {
          apiKeyConfigured: true,
          message: `xAI check failed with ${response.status}: ${body}`,
          model,
          provider: 'xai',
          reachable: false,
          status: 'error',
        };
      }

      return {
        apiKeyConfigured: true,
        message: 'xAI API is reachable',
        model,
        provider: 'xai',
        reachable: true,
        status: 'ready',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown xAI error';

      return {
        apiKeyConfigured: true,
        message: `xAI check failed: ${message}`,
        model,
        provider: 'xai',
        reachable: false,
        status: 'error',
      };
    }
  }
}
