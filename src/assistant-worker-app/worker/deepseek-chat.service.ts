import {
  Injectable,
  Logger,
} from '@nestjs/common';
import type {
  AssistantLlmMessage,
  AssistantLlmProvider,
} from './assistant-llm-provider';
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

  async generateFromMessages(messages: AssistantLlmMessage[]): Promise<string> {
    return this.sendChatCompletion(messages);
  }

  async summarizeConversation(
    messages: AssistantLlmMessage[],
    previousContext: string,
  ): Promise<string> {
    const summaryInstructions = [
      'Summarize the conversation for compact future context.',
      'Return plain text only (no markdown, no JSON).',
      'Keep it concise and reusable (1-3 sentences).',
      `Previous summary: ${previousContext.trim() || '(empty)'}`,
      'Preserve active topic, decisions, preferences, constraints, and unresolved questions.',
      'Drop filler and repetitive phrasing.',
    ].join('\n');
    const summaryMessages: AssistantLlmMessage[] = [
      { content: summaryInstructions, role: 'system' },
      ...messages,
    ];
    const summary = await this.sendChatCompletion(summaryMessages);
    return this.normalizeSummary(summary, previousContext);
  }

  private async sendChatCompletion(messages: AssistantLlmMessage[]): Promise<string> {
    const providerConfig = await this.currentConfig();
    const apiKey = providerConfig.apiKey;

    if (!apiKey) {
      throw new Error('DeepSeek API key is not configured in assistant-worker web settings');
    }

    const baseUrl = providerConfig.baseUrl;
    const model = providerConfig.model;
    const timeoutMs = providerConfig.timeoutMs;
    const requestBody = {
      messages,
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

  private normalizeSummary(summary: string, previousContext: string): string {
    const normalized = this.stripMarkdownFence(summary).trim();

    if (!normalized) {
      return previousContext.trim();
    }

    return normalized.length > 1200 ? `${normalized.slice(0, 1200)}…` : normalized;
  }

  private stripMarkdownFence(value: string): string {
    const match = value.trim().match(/^```(?:text|md|markdown)?\s*([\s\S]*?)\s*```$/i);
    return match ? match[1] : value;
  }

  private preview(value: unknown): string {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    return serialized.length > 4000 ? `${serialized.slice(0, 4000)}…` : serialized;
  }
}
