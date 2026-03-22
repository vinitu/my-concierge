import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { QueueMessage } from '../../assistant-api-app/queue/queue-adapter';
import type { AssistantLlmProvider } from './assistant-llm-provider';
import { AssistantWorkerPromptService } from './assistant-worker-prompt.service';
import { AssistantWorkerRuntimeContextService } from './assistant-worker-runtime-context.service';

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
  constructor(
    private readonly configService: ConfigService,
    private readonly promptService: AssistantWorkerPromptService,
    private readonly runtimeContextService: AssistantWorkerRuntimeContextService,
  ) {}

  private modelName(): string {
    return this.configService.get<string>('XAI_MODEL', 'grok-4');
  }

  async generateReply(message: QueueMessage): Promise<string> {
    const apiKey = this.configService.get<string>('XAI_API_KEY', '').trim();

    if (!apiKey) {
      throw new Error('XAI_API_KEY is required for assistant-worker');
    }

    const baseUrl = this.configService.get<string>('XAI_BASE_URL', 'https://api.x.ai/v1');
    const model = this.modelName();
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
            content: this.promptService.buildSystemPrompt(runtimeContext),
          },
          {
            role: 'user',
            content: this.promptService.buildUserPrompt(message),
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
