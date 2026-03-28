import {
  Injectable,
  Logger,
} from '@nestjs/common';
import type { AssistantLlmProvider } from './assistant-llm-provider';
import { AssistantWorkerConfigService } from './assistant-worker-config.service';

interface XaiOutputContentItem {
  text?: string;
  type?: string;
}

interface XaiOutputItem {
  content?: XaiOutputContentItem[];
  role?: string;
  type?: string;
}

interface XaiResponseBody {
  error?: {
    message?: string;
  };
  output?: XaiOutputItem[];
  output_text?: string;
}

@Injectable()
export class GrokResponsesService implements AssistantLlmProvider {
  private readonly logger = new Logger(GrokResponsesService.name);

  constructor(private readonly assistantWorkerConfigService: AssistantWorkerConfigService) {}

  private async currentConfig(): Promise<{
    apiKey: string;
    baseUrl: string;
    model: string;
    timeoutMs: number;
  }> {
    const config = await this.assistantWorkerConfigService.read();
    return {
      apiKey: config.xai_api_key.trim(),
      baseUrl: config.xai_base_url,
      model: config.provider === 'xai' ? config.model : 'grok-4',
      timeoutMs: config.xai_timeout_ms,
    };
  }

  async generateText(prompt: string): Promise<string> {
    const providerConfig = await this.currentConfig();
    const apiKey = providerConfig.apiKey;

    if (!apiKey) {
      throw new Error('xAI API key is not configured in assistant-worker web settings');
    }

    const baseUrl = providerConfig.baseUrl;
    const model = providerConfig.model;
    const timeoutMs = providerConfig.timeoutMs;
    const requestBody = {
      input: [
        {
          content: prompt,
          role: 'system',
        },
      ],
      model,
      store: false,
    };
    this.logger.debug(`xAI reply request: ${JSON.stringify(requestBody)}`);
    const response = await fetch(`${baseUrl}/responses`, {
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
      throw new Error(`xAI API returned ${response.status}: ${errorBody}`);
    }

    const body = (await response.json()) as XaiResponseBody;
    this.logger.debug(`xAI reply response: ${this.preview(body)}`);
    return this.extractAssistantText(body);
  }

  private extractAssistantText(body: XaiResponseBody): string {
    if (typeof body.output_text === 'string' && body.output_text.trim()) {
      this.logger.debug(`xAI extracted text: ${this.preview(body.output_text.trim())}`);
      return body.output_text.trim();
    }

    const texts =
      body.output
        ?.filter((item) => item.type === 'message')
        .flatMap((item) =>
          (item.content ?? [])
            .filter((contentItem) => contentItem.type === 'output_text')
            .map((contentItem) => contentItem.text?.trim() ?? ''),
        )
        .filter((text) => text.length > 0) ?? [];

    if (texts.length > 0) {
      this.logger.debug(`xAI extracted text: ${this.preview(texts.join('\n').trim())}`);
      return texts.join('\n').trim();
    }

    const errorMessage = body.error?.message;

    if (errorMessage) {
      throw new Error(`xAI API error: ${errorMessage}`);
    }

    throw new Error('xAI API response did not contain assistant text');
  }

  private preview(value: unknown): string {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    return serialized.length > 4000 ? `${serialized.slice(0, 4000)}…` : serialized;
  }
}
