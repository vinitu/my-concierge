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

interface OllamaChatResponse {
  error?: string;
  message?: {
    content?: string;
  };
}

interface OllamaToolDefinition {
  function: {
    description: string;
    name: string;
    parameters: {
      additionalProperties: boolean;
      properties: Record<string, never>;
      type: 'object';
    };
  };
  type: 'function';
}

@Injectable()
export class OllamaChatService implements AssistantLlmProviderPort {
  private readonly logger = new Logger(OllamaChatService.name);

  constructor(private readonly assistantLlmConfigService: AssistantLlmConfigService) {}

  async generateFromMessages(
    messages: AssistantLlmMessage[],
    availableTools?: AssistantLlmAvailableTool[],
  ): Promise<string> {
    const config = await this.assistantLlmConfigService.read();
    const tools = this.toOllamaTools(availableTools);
    const requestBody = {
      messages,
      model: config.provider === 'ollama' ? config.model : 'qwen3:1.7b',
      stream: false,
      think: false,
      ...(tools.length > 0 ? { tools } : {}),
    };
    return this.sendChat(requestBody, config.ollama_base_url, config.ollama_timeout_ms);
  }

  async summarizeConversation(
    messages: AssistantLlmMessage[],
    previousContext: string,
  ): Promise<string> {
    const config = await this.assistantLlmConfigService.read();
    const summaryInstructions = [
      'Summarize the conversation for compact future context.',
      'Return plain text only (no markdown, no JSON).',
      'Keep it concise and reusable (1-3 sentences).',
      `Previous summary: ${previousContext.trim() || '(empty)'}`,
      'Preserve active topic, decisions, preferences, constraints, and unresolved questions.',
      'Drop filler and repetitive phrasing.',
    ].join('\n');
    const requestBody = {
      messages: [{ content: summaryInstructions, role: 'system' }, ...messages],
      model: config.provider === 'ollama' ? config.model : 'qwen3:1.7b',
      stream: false,
      think: false,
    };
    const summary = await this.sendChat(
      requestBody,
      config.ollama_base_url,
      config.ollama_timeout_ms,
      { allowEmptyAssistantText: true },
    );
    return this.normalizeSummary(summary, previousContext);
  }

  private async sendChat(
    requestBody: Record<string, unknown>,
    baseUrl: string,
    timeoutMs: number,
    options?: {
      allowEmptyAssistantText?: boolean;
    },
  ): Promise<string> {
    this.logger.debug(`Ollama reply request: ${this.preview(requestBody)}`);
    const response = await fetch(`${baseUrl}/api/chat`, {
      body: JSON.stringify(requestBody),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Ollama API returned ${response.status}: ${errorBody}`);
    }

    const body = (await response.json()) as OllamaChatResponse;
    this.logger.debug(`Ollama reply response: ${this.preview(body)}`);
    const content = body.message?.content?.trim();

    if (content && content.length > 0) {
      this.logExtractedOutput(content);
      return content;
    }

    if (body.error) {
      throw new Error(`Ollama API error: ${body.error}`);
    }

    if (options?.allowEmptyAssistantText) {
      this.logger.warn('Ollama API response did not contain assistant text; returning empty text');
      return '';
    }

    throw new Error('Ollama API response did not contain assistant text');
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
    this.logger.debug(`Ollama extracted text: ${this.preview(content)}`);
    const parsedJson = this.tryFormatJson(content);
    if (parsedJson) {
      this.logger.debug(`Ollama extracted json: ${parsedJson}`);
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

  private toOllamaTools(
    availableTools?: AssistantLlmAvailableTool[],
  ): OllamaToolDefinition[] {
    if (!availableTools || availableTools.length === 0) {
      return [];
    }

    const seen = new Set<string>();
    const tools: OllamaToolDefinition[] = [];
    for (const tool of availableTools) {
      const name = typeof tool.name === 'string' ? tool.name.trim() : '';
      if (!name || seen.has(name)) {
        continue;
      }
      seen.add(name);
      tools.push({
        function: {
          description:
            typeof tool.description === 'string' && tool.description.trim().length > 0
              ? tool.description.trim()
              : `Assistant tool ${name}`,
          name,
          parameters: {
            additionalProperties: true,
            properties: {},
            type: 'object',
          },
        },
        type: 'function',
      });
    }
    return tools;
  }
}
