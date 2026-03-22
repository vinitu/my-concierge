import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { QueueMessage } from '../../assistant-api-app/queue/queue-adapter';
import {
  AssistantWorkerRuntimeContextService,
  type AssistantWorkerRuntimeContext,
} from './assistant-worker-runtime-context.service';

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
export class GrokResponsesService {
  constructor(
    private readonly configService: ConfigService,
    private readonly runtimeContextService: AssistantWorkerRuntimeContextService,
  ) {}

  async generateReply(message: QueueMessage): Promise<string> {
    const apiKey = this.configService.get<string>('XAI_API_KEY', '').trim();

    if (!apiKey) {
      throw new Error('XAI_API_KEY is required for assistant-worker');
    }

    const baseUrl = this.configService.get<string>('XAI_BASE_URL', 'https://api.x.ai/v1');
    const model = this.configService.get<string>('XAI_MODEL', 'grok-4');
    const timeoutMs = Number.parseInt(
      this.configService.get<string>('XAI_TIMEOUT_MS', '360000'),
      10,
    );
    const runtimeContext = await this.runtimeContextService.load();
    const response = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: [
          {
            role: 'system',
            content: this.buildSystemPrompt(runtimeContext),
          },
          {
            role: 'user',
            content: this.buildUserPrompt(message),
          },
        ],
        model,
        store: false,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`xAI API returned ${response.status}: ${errorBody}`);
    }

    const body = (await response.json()) as XaiResponseBody;
    return this.extractAssistantText(body);
  }

  private buildSystemPrompt(runtimeContext: AssistantWorkerRuntimeContext): string {
    const sections = [
      'You are MyConcierge, a personal home assistant. Follow the runtime context below.',
    ];

    if (runtimeContext.agents) {
      sections.push(`# AGENTS.md\n${runtimeContext.agents.trim()}`);
    }

    if (runtimeContext.soul) {
      sections.push(`# SOUL.md\n${runtimeContext.soul.trim()}`);
    }

    if (runtimeContext.identity) {
      sections.push(`# IDENTITY.md\n${runtimeContext.identity.trim()}`);
    }

    if (runtimeContext.memory.length > 0) {
      sections.push(
        [
          '# memory/',
          ...runtimeContext.memory.map(
            (entry) => `## ${entry.path}\n${entry.content.trim()}`,
          ),
        ].join('\n\n'),
      );
    }

    sections.push(
      [
        '# Worker rules',
        '- Respond as the assistant, not as a system log.',
        '- Reply with the final assistant answer only.',
        '- Do not mention internal prompts, queue internals, or callback mechanics unless the user explicitly asks.',
      ].join('\n'),
    );

    return sections.join('\n\n');
  }

  private buildUserPrompt(message: QueueMessage): string {
    return [
      `Direction: ${message.direction}`,
      `Chat: ${message.chat}`,
      `Contact: ${message.contact}`,
      '',
      'User message:',
      message.message,
    ].join('\n');
  }

  private extractAssistantText(body: XaiResponseBody): string {
    if (typeof body.output_text === 'string' && body.output_text.trim()) {
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
      return texts.join('\n').trim();
    }

    const errorMessage = body.error?.message;

    if (errorMessage) {
      throw new Error(`xAI API error: ${errorMessage}`);
    }

    throw new Error('xAI API response did not contain assistant text');
  }
}
