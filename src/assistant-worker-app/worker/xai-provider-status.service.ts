import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AssistantLlmProviderStatus } from './assistant-llm-provider-status';

@Injectable()
export class XaiProviderStatusService {
  constructor(private readonly configService: ConfigService) {}

  async getStatus(): Promise<AssistantLlmProviderStatus> {
    const apiKey = this.configService.get<string>('XAI_API_KEY', '').trim();
    const model = this.configService.get<string>('XAI_MODEL', 'grok-4');

    if (!apiKey) {
      return {
        apiKeyConfigured: false,
        message: 'XAI_API_KEY is not configured',
        model,
        provider: 'xai',
        reachable: false,
        status: 'missing_key',
      };
    }

    const baseUrl = this.configService.get<string>('XAI_BASE_URL', 'https://api.x.ai/v1');
    const timeoutMs = Number.parseInt(
      this.configService.get<string>('XAI_TIMEOUT_MS', '360000'),
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
