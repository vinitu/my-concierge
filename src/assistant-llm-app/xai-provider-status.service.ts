import { Injectable } from '@nestjs/common';
import type { AssistantLlmProviderStatus } from '../contracts/assistant-llm';
import { AssistantLlmConfigService } from './assistant-llm-config.service';

@Injectable()
export class XaiProviderStatusService {
  constructor(private readonly assistantLlmConfigService: AssistantLlmConfigService) {}

  async getStatus(): Promise<AssistantLlmProviderStatus> {
    const config = await this.assistantLlmConfigService.read();
    const apiKey = config.xai_api_key.trim();
    const model = config.provider === 'xai' ? config.model : 'grok-4';

    if (!apiKey) {
      return {
        apiKeyConfigured: false,
        message: 'xAI API key is not configured in assistant-llm settings',
        model,
        provider: 'xai',
        reachable: false,
        status: 'missing_key',
      };
    }

    try {
      const response = await fetch(`${config.xai_base_url}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        method: 'GET',
        signal: AbortSignal.timeout(config.xai_timeout_ms),
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
      return {
        apiKeyConfigured: true,
        message: `xAI check failed: ${error instanceof Error ? error.message : String(error)}`,
        model,
        provider: 'xai',
        reachable: false,
        status: 'error',
      };
    }
  }
}
