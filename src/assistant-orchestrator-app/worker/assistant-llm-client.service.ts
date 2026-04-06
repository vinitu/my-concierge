import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AssistantLlmAvailableTool,
  AssistantLlmConversationRespondResponse,
  AssistantLlmMessage,
  AssistantLlmModelCatalogEntry,
  AssistantLlmModelsResponse,
  AssistantLlmProvider,
  AssistantLlmProviderStatus,
} from '../../contracts/assistant-llm';
import { STATIC_PROVIDER_MODELS } from '../../contracts/assistant-llm-model-catalog';
import type { AssistantLlmProvider as AssistantLlmProviderPort } from './assistant-llm-provider';

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

@Injectable()
export class AssistantLlmClientService implements AssistantLlmProviderPort {
  constructor(private readonly configService: ConfigService) {}

  async generateFromMessages(
    messages: AssistantLlmMessage[],
    availableTools?: AssistantLlmAvailableTool[],
  ): Promise<AssistantLlmConversationRespondResponse> {
    const response = await fetch(`${this.baseUrl()}/v1/conversation`, {
      body: JSON.stringify({
        messages,
        tools: availableTools ?? [],
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `assistant-llm returned ${String(response.status)} for /v1/conversation: ${body}`,
      );
    }

    return (await response.json()) as AssistantLlmConversationRespondResponse;
  }

  async providerStatus(): Promise<AssistantLlmProviderStatus> {
    const response = await fetch(`${this.baseUrl()}/provider`);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `assistant-llm returned ${String(response.status)} for /provider: ${body}`,
      );
    }

    return (await response.json()) as AssistantLlmProviderStatus;
  }

  async models(): Promise<Record<AssistantLlmProvider, AssistantLlmModelCatalogEntry[]>> {
    const response = await fetch(`${this.baseUrl()}/models`);

    if (!response.ok) {
      return {
        deepseek: STATIC_PROVIDER_MODELS.deepseek.map((name) => ({
          enabled: true,
          name,
          status: null,
        })),
        ollama: STATIC_PROVIDER_MODELS.ollama.map((name) => ({
          enabled: true,
          name,
          status: null,
        })),
        xai: STATIC_PROVIDER_MODELS.xai.map((name) => ({
          enabled: true,
          name,
          status: null,
        })),
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
