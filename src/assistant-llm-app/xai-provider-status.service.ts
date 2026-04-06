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
        enabled: false,
        model,
        provider: 'xai',
        status: 'xAI API key is not configured in assistant-llm settings',
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
          enabled: false,
          model,
          provider: 'xai',
          status: `xAI check failed with ${response.status}: ${body}`,
        };
      }

      return {
        enabled: true,
        model,
        provider: 'xai',
        status: 'ok',
      };
    } catch (error) {
      return {
        enabled: false,
        model,
        provider: 'xai',
        status: `xAI check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
