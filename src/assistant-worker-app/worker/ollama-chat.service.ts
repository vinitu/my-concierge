import {
  Injectable,
  Logger,
} from '@nestjs/common';
import type { AssistantLlmProvider } from './assistant-llm-provider';
import { AssistantWorkerConfigService } from './assistant-worker-config.service';

interface OllamaChatResponse {
  error?: string;
  message?: {
    content?: string;
  };
}

@Injectable()
export class OllamaChatService implements AssistantLlmProvider {
  private readonly logger = new Logger(OllamaChatService.name);

  constructor(private readonly assistantWorkerConfigService: AssistantWorkerConfigService) {}

  private async currentConfig(): Promise<{
    baseUrl: string;
    model: string;
    timeoutMs: number;
  }> {
    const config = await this.assistantWorkerConfigService.read();
    return {
      baseUrl: config.ollama_base_url,
      model: config.provider === 'ollama' ? config.model : 'gemma3:1b',
      timeoutMs: config.ollama_timeout_ms,
    };
  }

  async generateText(prompt: string): Promise<string> {
    const providerConfig = await this.currentConfig();
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
    this.logger.debug(`Ollama reply request: ${JSON.stringify(requestBody)}`);
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Ollama API returned ${response.status}: ${errorBody}`);
    }

    const body = (await response.json()) as OllamaChatResponse;
    this.logger.debug(`Ollama reply response: ${this.preview(body)}`);
    const content = body.message?.content?.trim();

    if (content) {
      this.logger.debug(`Ollama extracted text: ${this.preview(content)}`);
      return content;
    }

    if (body.error) {
      throw new Error(`Ollama API error: ${body.error}`);
    }

    throw new Error('Ollama API response did not contain assistant text');
  }

  private preview(value: unknown): string {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    return serialized.length > 4000 ? `${serialized.slice(0, 4000)}…` : serialized;
  }
}
