import { Injectable } from '@nestjs/common';
import type {
  AssistantLlmMessage,
  AssistantLlmProvider as AssistantLlmProviderPort,
} from './assistant-llm-provider';
import { AssistantLlmClientService } from './assistant-llm-client.service';

@Injectable()
export class AssistantLlmProviderService implements AssistantLlmProviderPort {
  constructor(
    private readonly assistantLlmClientService: AssistantLlmClientService,
  ) {}

  async generateFromMessages(messages: AssistantLlmMessage[]): Promise<string> {
    return this.assistantLlmClientService.generateFromMessages(messages);
  }

  async summarizeConversation(
    messages: AssistantLlmMessage[],
    previousContext: string,
  ): Promise<string> {
    return this.assistantLlmClientService.summarizeConversation(messages, previousContext);
  }
}
