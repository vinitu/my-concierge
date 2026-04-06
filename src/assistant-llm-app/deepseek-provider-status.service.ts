import { Injectable } from '@nestjs/common';
import type { AssistantLlmProviderStatus } from '../contracts/assistant-llm';
import { AssistantLlmConfigService } from './assistant-llm-config.service';

@Injectable()
export class DeepseekProviderStatusService {
  constructor(private readonly assistantLlmConfigService: AssistantLlmConfigService) {}

  async getStatus(): Promise<AssistantLlmProviderStatus> {
    const config = await this.assistantLlmConfigService.read();
    const apiKey = config.deepseek_api_key.trim();
    const model = config.provider === 'deepseek' ? config.model : 'deepseek-chat';

    if (!apiKey) {
      return {
        enabled: false,
        model,
        provider: 'deepseek',
        status: 'DeepSeek API key is not configured in assistant-llm settings',
      };
    }

    try {
      const response = await fetch(`${config.deepseek_base_url}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        method: 'GET',
        signal: AbortSignal.timeout(config.deepseek_timeout_ms),
      });

      if (!response.ok) {
        const body = await response.text();
        return {
          enabled: false,
          model,
          provider: 'deepseek',
          status: `DeepSeek check failed with ${response.status}: ${body}`,
        };
      }

      return {
        enabled: true,
        model,
        provider: 'deepseek',
        status: 'ok',
      };
    } catch (error) {
      return {
        enabled: false,
        model,
        provider: 'deepseek',
        status: `DeepSeek check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
