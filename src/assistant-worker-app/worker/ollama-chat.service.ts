import {
  Injectable,
  Logger,
} from '@nestjs/common';
import type {
  AssistantLlmMessage,
  AssistantLlmProvider,
} from './assistant-llm-provider';
import { AssistantWorkerConfigService } from './assistant-worker-config.service';
import { SUPPORTED_ASSISTANT_TOOL_NAMES } from './assistant-tool-catalog.service';

interface OllamaChatResponse {
  error?: string;
  message?: {
    content?: string;
  };
}

type OllamaPhase = 'planning' | 'synthesis' | 'summary';

const OLLAMA_TOOL_DEFINITIONS = SUPPORTED_ASSISTANT_TOOL_NAMES.map((toolName) => ({
  function: {
    description: `Assistant runtime tool: ${toolName}`,
    name: toolName,
    parameters: {
      additionalProperties: true,
      properties: {},
      type: 'object',
    },
  },
  type: 'function',
}));

const OLLAMA_PLANNING_FORMAT = {
  additionalProperties: false,
  properties: {
    context: { type: 'string' },
    memory_writes: {
      items: { additionalProperties: true, type: 'object' },
      type: 'array',
    },
    message: { type: 'string' },
    tool_arguments: {
      additionalProperties: true,
      type: 'object',
    },
    tool_name: {
      enum: [...SUPPORTED_ASSISTANT_TOOL_NAMES],
      type: 'string',
    },
    tool_observations: {
      items: { additionalProperties: true, type: 'object' },
      type: 'array',
    },
    type: {
      enum: ['final', 'tool_call', 'error'],
      type: 'string',
    },
  },
  required: ['type'],
  type: 'object',
} as const;

const OLLAMA_SYNTHESIS_FORMAT = {
  additionalProperties: false,
  properties: {
    context: { type: 'string' },
    memory_writes: {
      items: { additionalProperties: true, type: 'object' },
      type: 'array',
    },
    message: { type: 'string' },
    tool_observations: {
      items: { additionalProperties: true, type: 'object' },
      type: 'array',
    },
  },
  required: ['message', 'context', 'memory_writes', 'tool_observations'],
  type: 'object',
} as const;

@Injectable()
export class OllamaChatService implements AssistantLlmProvider {
  private readonly logger = new Logger(OllamaChatService.name);

  constructor(private readonly assistantWorkerConfigService: AssistantWorkerConfigService) {}

  private async currentConfig(): Promise<{
    baseUrl: string;
    model: string;
    structuredMode: boolean;
    timeoutMs: number;
  }> {
    const config = await this.assistantWorkerConfigService.read();
    return {
      baseUrl: config.ollama_base_url,
      model: config.provider === 'ollama' ? config.model : 'gemma3:1b',
      structuredMode: config.structured_mode,
      timeoutMs: config.ollama_timeout_ms,
    };
  }

  async generateFromMessages(messages: AssistantLlmMessage[]): Promise<string> {
    const phase = this.detectPhase(messages);
    return this.sendChat(messages, phase);
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
    const summary = await this.sendChat(summaryMessages, 'summary');
    return this.normalizeSummary(summary, previousContext);
  }

  private async sendChat(messages: AssistantLlmMessage[], phase: OllamaPhase): Promise<string> {
    const providerConfig = await this.currentConfig();
    const baseUrl = providerConfig.baseUrl;
    const model = providerConfig.model;
    const structuredMode = providerConfig.structuredMode;
    const timeoutMs = providerConfig.timeoutMs;
    const useStructuredMode = structuredMode && phase !== 'summary';
    const requestBody = {
      ...(useStructuredMode
        ? { format: this.formatForPhase(phase as Exclude<OllamaPhase, 'summary'>) }
        : {}),
      messages,
      model,
      stream: false,
      think: false,
      ...(useStructuredMode ? { tools: OLLAMA_TOOL_DEFINITIONS } : {}),
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

  private detectPhase(messages: AssistantLlmMessage[]): OllamaPhase {
    const systemMessage = messages.find((message) => message.role === 'system');
    const prompt = systemMessage?.content.toLowerCase() ?? '';

    if (prompt.includes('planning phase')) {
      return 'planning';
    }

    if (prompt.includes('synthesis phase')) {
      return 'synthesis';
    }

    return 'summary';
  }

  private formatForPhase(phase: Exclude<OllamaPhase, 'summary'>) {
    if (phase === 'planning') {
      return OLLAMA_PLANNING_FORMAT;
    }

    return OLLAMA_SYNTHESIS_FORMAT;
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
