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

  constructor(
    private readonly assistantWorkerConfigService: AssistantWorkerConfigService,
    private readonly configService: ConfigService,
    private readonly promptTemplateService: AssistantWorkerPromptTemplateService,
    private readonly runtimeContextService: AssistantWorkerRuntimeContextService,
  ) {}

  private async modelName(): Promise<string> {
    const config = await this.assistantWorkerConfigService.read();
    return config.provider === 'deepseek'
      ? config.model
      : this.configService.get<string>('DEEPSEEK_MODEL', 'deepseek-chat');
  }

  async generateReply(input: AssistantLlmGenerateInput): Promise<AssistantLlmGenerateResult> {
    const apiKey = this.configService.get<string>('DEEPSEEK_API_KEY', '').trim();

    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY is required for assistant-worker');
    }

    const baseUrl = this.configService.get<string>('DEEPSEEK_BASE_URL', 'https://api.deepseek.com');
    const model = await this.modelName();
    const timeoutMs = Number.parseInt(
      this.configService.get<string>('DEEPSEEK_TIMEOUT_MS', '360000'),
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
    const content = body.choices?.[0]?.message?.content?.trim();

    if (content) {
      return parseAssistantLlmResult(content);
    }

    if (body.error?.message) {
      throw new Error(`DeepSeek API error: ${body.error.message}`);
    }

    throw new Error('DeepSeek API response did not contain assistant text');
  }
}
