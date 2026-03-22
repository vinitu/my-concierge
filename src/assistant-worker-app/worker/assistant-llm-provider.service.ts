import { Injectable } from '@nestjs/common';
import type { QueueMessage } from '../../assistant-api-app/queue/queue-adapter';
import {
  AssistantWorkerConfigService,
  type AssistantWorkerConfig,
} from './assistant-worker-config.service';
import type { AssistantLlmProvider } from './assistant-llm-provider';
import { GrokResponsesService } from './grok-responses.service';
import { OllamaChatService } from './ollama-chat.service';

@Injectable()
export class AssistantLlmProviderService implements AssistantLlmProvider {
  constructor(
    private readonly assistantWorkerConfigService: AssistantWorkerConfigService,
    private readonly grokResponsesService: GrokResponsesService,
    private readonly ollamaChatService: OllamaChatService,
  ) {}

  async generateReply(message: QueueMessage): Promise<string> {
    const config = await this.assistantWorkerConfigService.read();
    return this.selectProvider(config).generateReply(message);
  }

  private selectProvider(config: AssistantWorkerConfig): AssistantLlmProvider {
    if (config.provider === 'xai') {
      return this.grokResponsesService;
    }

    if (config.provider === 'ollama') {
      return this.ollamaChatService;
    }

    throw new Error(`Unsupported assistant-worker provider: ${config.provider}`);
  }
}
