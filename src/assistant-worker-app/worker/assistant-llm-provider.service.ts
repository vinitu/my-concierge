import { Injectable } from '@nestjs/common';
import {
  AssistantWorkerConfigService,
  type AssistantWorkerConfig,
} from './assistant-worker-config.service';
import type {
  AssistantLlmProvider,
} from './assistant-llm-provider';
import { DeepseekChatService } from './deepseek-chat.service';
import { GrokResponsesService } from './grok-responses.service';
import { OllamaChatService } from './ollama-chat.service';

@Injectable()
export class AssistantLlmProviderService implements AssistantLlmProvider {
  constructor(
    private readonly assistantWorkerConfigService: AssistantWorkerConfigService,
    private readonly deepseekChatService: DeepseekChatService,
    private readonly grokResponsesService: GrokResponsesService,
    private readonly ollamaChatService: OllamaChatService,
  ) {}

  async generateText(prompt: string): Promise<string> {
    const config = await this.assistantWorkerConfigService.read();
    return this.selectProvider(config).generateText(prompt);
  }

  private selectProvider(config: AssistantWorkerConfig): AssistantLlmProvider {
    if (config.provider === 'deepseek') {
      return this.deepseekChatService;
    }

    if (config.provider === 'xai') {
      return this.grokResponsesService;
    }

    if (config.provider === 'ollama') {
      return this.ollamaChatService;
    }

    throw new Error(`Unsupported assistant-worker provider: ${config.provider}`);
  }
}
