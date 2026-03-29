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
        apiKeyConfigured: false,
        message: 'DeepSeek API key is not configured in assistant-llm settings',
        model,
        provider: 'deepseek',
        reachable: false,
        status: 'missing_key',
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
      return {
        apiKeyConfigured: true,
        message: `DeepSeek check failed: ${error instanceof Error ? error.message : String(error)}`,
        model,
        provider: 'deepseek',
        reachable: false,
        status: 'error',
      };
    }
  }
}
