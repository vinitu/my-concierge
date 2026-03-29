import {
  Injectable,
  Logger,
} from '@nestjs/common';
import type {
  AssistantLlmAvailableTool,
  AssistantLlmMessage,
} from '../contracts/assistant-llm';
import { AssistantLlmConfigService } from './assistant-llm-config.service';
import type { AssistantLlmProviderPort } from './assistant-llm-provider-port';

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
export class DeepseekChatService implements AssistantLlmProviderPort {
  private readonly logger = new Logger(DeepseekChatService.name);

  constructor(private readonly assistantLlmConfigService: AssistantLlmConfigService) {}

  async generateFromMessages(
    messages: AssistantLlmMessage[],
    _availableTools?: AssistantLlmAvailableTool[],
  ): Promise<string> {
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
    const summary = await this.sendChatCompletion([
      { content: summaryInstructions, role: 'system' },
      ...messages,
    ]);
    return this.normalizeSummary(summary, previousContext);
  }

  private async sendChatCompletion(messages: AssistantLlmMessage[]): Promise<string> {
    const config = await this.assistantLlmConfigService.read();
    const apiKey = config.deepseek_api_key.trim();

    if (!apiKey) {
      throw new Error('DeepSeek API key is not configured in assistant-llm settings');
    }

    const requestBody = {
      messages,
      model: config.provider === 'deepseek' ? config.model : 'deepseek-chat',
      stream: false,
    };
    this.logger.debug(`DeepSeek reply request: ${this.preview(requestBody)}`);

    const response = await fetch(`${config.deepseek_base_url}/chat/completions`, {
      body: JSON.stringify(requestBody),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(config.deepseek_timeout_ms),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`DeepSeek API returned ${response.status}: ${errorBody}`);
    }

    const body = (await response.json()) as DeepseekChatCompletionResponse;
    this.logger.debug(`DeepSeek reply response: ${this.preview(body)}`);
    const content = body.choices?.[0]?.message?.content?.trim();

    if (content) {
      this.logExtractedOutput(content);
      return content;
    }

    if (body.error?.message) {
      throw new Error(`DeepSeek API error: ${body.error.message}`);
    }

    throw new Error('DeepSeek API response did not contain assistant text');
  }

  private normalizeSummary(summary: string, previousContext: string): string {
    const normalized = summary.trim();
    if (!normalized) {
      return previousContext.trim();
    }
    return normalized.length > 1200 ? `${normalized.slice(0, 1200)}…` : normalized;
  }

  private preview(value: unknown): string {
    const serialized =
      typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return serialized.length > 3000 ? `${serialized.slice(0, 3000)}…` : serialized;
  }

  private logExtractedOutput(content: string): void {
    this.logger.debug(`DeepSeek extracted text: ${this.preview(content)}`);
    const parsedJson = this.tryFormatJson(content);
    if (parsedJson) {
      this.logger.debug(`DeepSeek extracted json: ${parsedJson}`);
    }
  }

  private tryFormatJson(text: string): string | null {
    const trimmed = text.trim();
    const unwrapped = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] ?? trimmed;
    try {
      const parsed = JSON.parse(unwrapped);
      return this.preview(parsed);
    } catch {
      return null;
    }
  }
}
