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

interface XaiOutputContentItem {
  text?: string;
  type?: string;
}

interface XaiOutputItem {
  content?: XaiOutputContentItem[];
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
export class GrokResponsesService implements AssistantLlmProviderPort {
  private readonly logger = new Logger(GrokResponsesService.name);

  constructor(private readonly assistantLlmConfigService: AssistantLlmConfigService) {}

  async generateFromMessages(
    messages: AssistantLlmMessage[],
    _availableTools?: AssistantLlmAvailableTool[],
  ): Promise<string> {
    return this.sendResponse(messages);
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
    const summary = await this.sendResponse([
      { content: summaryInstructions, role: 'system' },
      ...messages,
    ]);
    return this.normalizeSummary(summary, previousContext);
  }

  private async sendResponse(messages: AssistantLlmMessage[]): Promise<string> {
    const config = await this.assistantLlmConfigService.read();
    const apiKey = config.xai_api_key.trim();

    if (!apiKey) {
      throw new Error('xAI API key is not configured in assistant-llm settings');
    }

    const requestBody = {
      input: messages,
      model: config.provider === 'xai' ? config.model : 'grok-4',
      store: false,
    };
    this.logger.debug(`xAI reply request: ${this.preview(requestBody)}`);

    const response = await fetch(`${config.xai_base_url}/responses`, {
      body: JSON.stringify(requestBody),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(config.xai_timeout_ms),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`xAI API returned ${response.status}: ${errorBody}`);
    }

    const body = (await response.json()) as XaiResponseBody;
    this.logger.debug(`xAI reply response: ${this.preview(body)}`);
    return this.extractAssistantText(body);
  }

  private normalizeSummary(summary: string, previousContext: string): string {
    const normalized = summary.trim();
    if (!normalized) {
      return previousContext.trim();
    }
    return normalized.length > 1200 ? `${normalized.slice(0, 1200)}…` : normalized;
  }

  private extractAssistantText(body: XaiResponseBody): string {
    if (typeof body.output_text === 'string' && body.output_text.trim()) {
      const text = body.output_text.trim();
      this.logExtractedOutput(text);
      return text;
    }

    const texts =
      body.output
        ?.flatMap((item) =>
          (item.content ?? [])
            .filter((contentItem) => contentItem.type === 'output_text')
            .map((contentItem) => contentItem.text?.trim() ?? ''),
        )
        .filter((text) => text.length > 0) ?? [];

    if (texts.length > 0) {
      const text = texts.join('\n').trim();
      this.logExtractedOutput(text);
      return text;
    }

    if (body.error?.message) {
      throw new Error(`xAI API error: ${body.error.message}`);
    }

    throw new Error('xAI API response did not contain assistant text');
  }

  private preview(value: unknown): string {
    const serialized =
      typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return serialized.length > 3000 ? `${serialized.slice(0, 3000)}…` : serialized;
  }

  private logExtractedOutput(content: string): void {
    this.logger.debug(`xAI extracted text: ${this.preview(content)}`);
    const parsedJson = this.tryFormatJson(content);
    if (parsedJson) {
      this.logger.debug(`xAI extracted json: ${parsedJson}`);
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
