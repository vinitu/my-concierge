import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AssistantLlmGenerateInput,
  AssistantLlmProvider,
} from './assistant-llm-provider';
import {
  parseAssistantLlmResult,
  type AssistantLlmGenerateResult,
} from './assistant-llm-response-parser';
import { AssistantWorkerConfigService } from './assistant-worker-config.service';
import { AssistantWorkerPromptTemplateService } from './assistant-worker-prompt-template.service';
import { AssistantWorkerRuntimeContextService } from './assistant-worker-runtime-context.service';

interface OllamaChatResponse {
  error?: string;
  message?: {
    content?: string;
  };
}

@Injectable()
export class OllamaChatService implements AssistantLlmProvider {
  private readonly logger = new Logger(OllamaChatService.name);

  constructor(
    private readonly assistantWorkerConfigService: AssistantWorkerConfigService,
    private readonly configService: ConfigService,
    private readonly promptTemplateService: AssistantWorkerPromptTemplateService,
    private readonly runtimeContextService: AssistantWorkerRuntimeContextService,
  ) {}

  private async modelName(): Promise<string> {
    const config = await this.assistantWorkerConfigService.read();
    return config.provider === 'ollama'
      ? config.model
      : this.configService.get<string>('OLLAMA_MODEL', 'gemma3:1b');
  }

  async generateReply(input: AssistantLlmGenerateInput): Promise<AssistantLlmGenerateResult> {
    const baseUrl = this.configService.get<string>('OLLAMA_BASE_URL', 'http://host.docker.internal:11434');
    const model = await this.modelName();
    const timeoutMs = Number.parseInt(
      this.configService.get<string>('OLLAMA_TIMEOUT_MS', '360000'),
      10,
    );
    const runtimeContext = await this.runtimeContextService.load();
    const systemPrompt = await this.promptTemplateService.renderAssistantSystemPrompt(
      input,
      runtimeContext,
    );
    const requestBody = {
      messages: [
        {
          content: systemPrompt,
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
    const content = body.message?.content?.trim();

    if (content) {
      return parseAssistantLlmResult(content);
    }

    if (body.error) {
      throw new Error(`Ollama API error: ${body.error}`);
    }

    throw new Error('Ollama API response did not contain assistant text');
  }
}
