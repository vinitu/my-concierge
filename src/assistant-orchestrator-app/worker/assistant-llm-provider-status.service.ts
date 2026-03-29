import { Injectable } from '@nestjs/common';
import type { AssistantLlmProviderStatus } from './assistant-llm-provider-status';
import { AssistantLlmClientService } from './assistant-llm-client.service';

@Injectable()
export class AssistantLlmProviderStatusService {
  constructor(private readonly assistantLlmClientService: AssistantLlmClientService) {}

  async getStatus(): Promise<AssistantLlmProviderStatus> {
    return this.assistantLlmClientService.providerStatus();
  }
}
