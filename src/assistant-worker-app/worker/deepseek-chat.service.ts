import {
  Injectable,
  Logger,
} from '@nestjs/common';
import type { AssistantLlmProvider } from './assistant-llm-provider';
import { AssistantWorkerConfigService } from './assistant-worker-config.service';

interface DeepseekChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

@Injectable()
export class DeepseekChatService implements AssistantLlmProvider {
  private readonly logger = new Logger(DeepseekChatService.name);

  constructor(private readonly assistantWorkerConfigService: AssistantWorkerConfigService) {}

  private async currentConfig(): Promise<{
    apiKey: string;
    baseUrl: string;
    model: string;
    timeoutMs: number;
  }> {
    const config = await this.assistantWorkerConfigService.read();
    return {
      apiKey: config.deepseek_api_key.trim(),
      baseUrl: config.deepseek_base_url,
      model: config.provider === 'deepseek' ? config.model : 'deepseek-chat',
      timeoutMs: config.deepseek_timeout_ms,
    };
  }

  async generateText(prompt: string): Promise<string> {
    const providerConfig = await this.currentConfig();
    const apiKey = providerConfig.apiKey;

    if (!apiKey) {
      throw new Error('DeepSeek API key is not configured in assistant-worker web settings');
    }

    const baseUrl = providerConfig.baseUrl;
    const model = providerConfig.model;
    const timeoutMs = providerConfig.timeoutMs;
    const requestBody = {
      messages: [
        {
          content: prompt,
          role: 'system',
        },
      ],
      model,
      stream: false,
    };

    this.logger.debug(`DeepSeek reply request: ${JSON.stringify(requestBody)}`);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`DeepSeek API returned ${response.status}: ${errorBody}`);
    }

    const body = (await response.json()) as DeepseekChatCompletionResponse;
    this.logger.debug(`DeepSeek reply response: ${this.preview(body)}`);
    const content = body.choices?.[0]?.message?.content?.trim();

    if (content) {
      this.logger.debug(`DeepSeek extracted text: ${this.preview(content)}`);
      return content;
    }

    if (body.error?.message) {
      throw new Error(`DeepSeek API error: ${body.error.message}`);
    }

    throw new Error('DeepSeek API response did not contain assistant text');
  }

  private preview(value: unknown): string {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    return serialized.length > 4000 ? `${serialized.slice(0, 4000)}…` : serialized;
  }
}
