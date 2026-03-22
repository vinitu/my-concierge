import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AssistantLlmProviderStatus } from './assistant-llm-provider-status';
import { AssistantWorkerConfigService } from './assistant-worker-config.service';

@Injectable()
export class DeepseekProviderStatusService {
  constructor(
    private readonly assistantWorkerConfigService: AssistantWorkerConfigService,
    private readonly configService: ConfigService,
  ) {}

  async getStatus(): Promise<AssistantLlmProviderStatus> {
    const apiKey = this.configService.get<string>('DEEPSEEK_API_KEY', '').trim();
    const config = await this.assistantWorkerConfigService.read();
    const model =
      config.provider === 'deepseek'
        ? config.model
        : this.configService.get<string>('DEEPSEEK_MODEL', 'deepseek-chat');

    if (!apiKey) {
      return {
        apiKeyConfigured: false,
        message: 'DEEPSEEK_API_KEY is not configured',
        model,
        provider: 'deepseek',
        reachable: false,
        status: 'missing_key',
      };
    }

    const baseUrl = this.configService.get<string>('DEEPSEEK_BASE_URL', 'https://api.deepseek.com');
    const timeoutMs = Number.parseInt(
      this.configService.get<string>('DEEPSEEK_TIMEOUT_MS', '360000'),
      10,
    );

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
