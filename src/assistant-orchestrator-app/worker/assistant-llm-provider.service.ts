import { Injectable } from '@nestjs/common';
import type {
  AssistantLlmAvailableTool,
  AssistantLlmConversationRespondResponse,
  AssistantLlmMessage,
  AssistantLlmProvider as AssistantLlmProviderPort,
} from './assistant-llm-provider';
import { AssistantLlmClientService } from './assistant-llm-client.service';

@Injectable()
export class AssistantLlmProviderService implements AssistantLlmProviderPort {
  constructor(
    private readonly assistantLlmClientService: AssistantLlmClientService,
  ) {}

  async generateFromMessages(
    messages: AssistantLlmMessage[],
    availableTools?: AssistantLlmAvailableTool[],
  ): Promise<AssistantLlmConversationRespondResponse> {
    return this.assistantLlmClientService.generateFromMessages(
      messages,
      availableTools,
    );
  }

  async summarizeConversation(
    messages: AssistantLlmMessage[],
    previousContext: string,
  ): Promise<string> {
    return this.assistantLlmClientService.summarizeConversation(messages, previousContext);
  }
}
