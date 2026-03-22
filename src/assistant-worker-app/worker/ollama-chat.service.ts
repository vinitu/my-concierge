import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { QueueMessage } from '../../assistant-api-app/queue/queue-adapter';
import type { AssistantLlmProvider } from './assistant-llm-provider';
import { AssistantWorkerPromptService } from './assistant-worker-prompt.service';
import { AssistantWorkerRuntimeContextService } from './assistant-worker-runtime-context.service';

interface OllamaChatResponse {
  error?: string;
  message?: {
    content?: string;
  };
}

@Injectable()
export class OllamaChatService implements AssistantLlmProvider {
  constructor(
    private readonly configService: ConfigService,
    private readonly promptService: AssistantWorkerPromptService,
    private readonly runtimeContextService: AssistantWorkerRuntimeContextService,
  ) {}

  private modelName(): string {
    return this.configService.get<string>('OLLAMA_MODEL', 'gemma3:1b');
  }

  async generateReply(message: QueueMessage): Promise<string> {
    const baseUrl = this.configService.get<string>('OLLAMA_BASE_URL', 'http://host.docker.internal:11434');
    const model = this.modelName();
    const timeoutMs = Number.parseInt(
      this.configService.get<string>('OLLAMA_TIMEOUT_MS', '360000'),
      10,
    );
    const runtimeContext = await this.runtimeContextService.load();
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            content: this.promptService.buildSystemPrompt(runtimeContext),
            role: 'system',
          },
          {
            content: this.promptService.buildUserPrompt(message),
            role: 'user',
          },
        ],
        model,
        stream: false,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Ollama API returned ${response.status}: ${errorBody}`);
    }

    const body = (await response.json()) as OllamaChatResponse;
    const content = body.message?.content?.trim();

    if (content) {
      return content;
    }

    if (body.error) {
      throw new Error(`Ollama API error: ${body.error}`);
    }

    throw new Error('Ollama API response did not contain assistant text');
  }
}
