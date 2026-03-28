import { Injectable } from '@nestjs/common';
import type { AssistantLlmProviderStatus } from './assistant-llm-provider-status';
import { AssistantWorkerConfigService } from './assistant-worker-config.service';

@Injectable()
export class DeepseekProviderStatusService {
  constructor(private readonly assistantWorkerConfigService: AssistantWorkerConfigService) {}

  async getStatus(): Promise<AssistantLlmProviderStatus> {
    const config = await this.assistantWorkerConfigService.read();
    const apiKey = config.deepseek_api_key.trim();
    const model = config.provider === 'deepseek' ? config.model : 'deepseek-chat';

    if (!apiKey) {
      return {
        apiKeyConfigured: false,
        message: 'DeepSeek API key is not configured in assistant-worker web settings',
        model,
        provider: 'deepseek',
        reachable: false,
        status: 'missing_key',
      };
    }

    const baseUrl = config.deepseek_base_url;
    const timeoutMs = config.deepseek_timeout_ms;

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
          message: `DeepSeek check failed with ${response.status}: ${body}`,
          model,
          provider: 'deepseek',
          reachable: false,
          status: 'error',
        };
      }

      return {
        apiKeyConfigured: true,
        message: 'DeepSeek API is reachable',
        model,
        provider: 'deepseek',
        reachable: true,
        status: 'ready',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown DeepSeek error';

      return {
        apiKeyConfigured: true,
        message: `DeepSeek check failed: ${message}`,
        model,
        provider: 'deepseek',
        reachable: false,
        status: 'error',
      };
    }
  }
}
