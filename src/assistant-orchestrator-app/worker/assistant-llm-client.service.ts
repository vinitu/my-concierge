import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AssistantLlmMainGenerateResponse,
  AssistantLlmMessage,
  AssistantLlmProvider,
  AssistantLlmProviderStatus,
  AssistantLlmSummarizeResponse,
} from '../../contracts/assistant-llm';
import { STATIC_PROVIDER_MODELS } from './assistant-llm-model-catalog';
import type { AssistantLlmProvider as AssistantLlmProviderPort } from './assistant-llm-provider';

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

interface AssistantLlmModelsResponse {
  models: Record<AssistantLlmProvider, string[]>;
}

@Injectable()
export class AssistantLlmClientService implements AssistantLlmProviderPort {
  constructor(private readonly configService: ConfigService) {}

  async generateFromMessages(messages: AssistantLlmMessage[]): Promise<string> {
    const response = await fetch(`${this.baseUrl()}/v1/generate/main`, {
      body: JSON.stringify({ messages }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `assistant-llm returned ${String(response.status)} for /v1/generate/main: ${body}`,
      );
    }

    const payload = (await response.json()) as AssistantLlmMainGenerateResponse;
    return payload.text;
  }

  async summarizeConversation(
    messages: AssistantLlmMessage[],
    previousContext: string,
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl()}/v1/generate/summarize`, {
      body: JSON.stringify({
        messages,
        previous_context: previousContext,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `assistant-llm returned ${String(response.status)} for /v1/generate/summarize: ${body}`,
      );
    }

    const payload = (await response.json()) as AssistantLlmSummarizeResponse;
    return payload.summary;
  }

  async providerStatus(): Promise<AssistantLlmProviderStatus> {
    const response = await fetch(`${this.baseUrl()}/provider-status`);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `assistant-llm returned ${String(response.status)} for /provider-status: ${body}`,
      );
    }

    return (await response.json()) as AssistantLlmProviderStatus;
  }

  async models(): Promise<Record<AssistantLlmProvider, string[]>> {
    const response = await fetch(`${this.baseUrl()}/models`);

    if (!response.ok) {
      return {
        deepseek: [...STATIC_PROVIDER_MODELS.deepseek],
        ollama: [...STATIC_PROVIDER_MODELS.ollama],
        xai: [...STATIC_PROVIDER_MODELS.xai],
      };
    }

    const payload = (await response.json()) as AssistantLlmModelsResponse;
    return payload.models;
  }

  private baseUrl(): string {
    return trimTrailingSlash(
      this.configService.get<string>('ASSISTANT_LLM_URL', 'http://assistant-llm:3000'),
    );
  }
}
