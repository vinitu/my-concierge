import { Injectable } from '@nestjs/common';
import type { AssistantLlmProviderStatus } from './assistant-llm-provider-status';
import {
  AssistantWorkerConfigService,
  type AssistantWorkerConfig,
} from './assistant-worker-config.service';
import { DeepseekProviderStatusService } from './deepseek-provider-status.service';
import { OllamaProviderStatusService } from './ollama-provider-status.service';
import { XaiProviderStatusService } from './xai-provider-status.service';

@Injectable()
export class AssistantLlmProviderStatusService {
  constructor(
    private readonly assistantWorkerConfigService: AssistantWorkerConfigService,
    private readonly deepseekProviderStatusService: DeepseekProviderStatusService,
    private readonly ollamaProviderStatusService: OllamaProviderStatusService,
    private readonly xaiProviderStatusService: XaiProviderStatusService,
  ) {}

  async getStatus(): Promise<AssistantLlmProviderStatus> {
    const config = await this.assistantWorkerConfigService.read();
    return this.selectProvider(config).getStatus();
  }

  private selectProvider(
    config: AssistantWorkerConfig,
  ): DeepseekProviderStatusService | OllamaProviderStatusService | XaiProviderStatusService {
    if (config.provider === 'deepseek') {
      return this.deepseekProviderStatusService;
    }

    if (config.provider === 'xai') {
      return this.xaiProviderStatusService;
    }

    if (config.provider === 'ollama') {
      return this.ollamaProviderStatusService;
    }

    throw new Error(`Unsupported assistant-worker provider: ${config.provider}`);
  }
}
