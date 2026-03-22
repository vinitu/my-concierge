import { AssistantLlmProviderStatusService } from './assistant-llm-provider-status.service';
import { AssistantWorkerConfigService } from './assistant-worker-config.service';
import { OllamaProviderStatusService } from './ollama-provider-status.service';
import { XaiProviderStatusService } from './xai-provider-status.service';

describe('AssistantLlmProviderStatusService', () => {
  it('returns xai status when xai is selected', async () => {
    const service = new AssistantLlmProviderStatusService(
      {
        read: jest.fn().mockResolvedValue({ provider: 'xai' }),
      } as unknown as AssistantWorkerConfigService,
      {
        getStatus: jest.fn().mockResolvedValue({
          apiKeyConfigured: null,
          message: 'ollama ready',
          model: 'gemma3:1b',
          provider: 'ollama',
          reachable: true,
          status: 'ready',
        }),
      } as unknown as OllamaProviderStatusService,
      {
        getStatus: jest.fn().mockResolvedValue({
          apiKeyConfigured: true,
          message: 'xai ready',
          model: 'grok-4',
          provider: 'xai',
          reachable: true,
          status: 'ready',
        }),
      } as unknown as XaiProviderStatusService,
    );

    await expect(service.getStatus()).resolves.toEqual({
      apiKeyConfigured: true,
      message: 'xai ready',
      model: 'grok-4',
      provider: 'xai',
      reachable: true,
      status: 'ready',
    });
  });

  it('returns ollama status when ollama is selected', async () => {
    const service = new AssistantLlmProviderStatusService(
      {
        read: jest.fn().mockResolvedValue({ provider: 'ollama' }),
      } as unknown as AssistantWorkerConfigService,
      {
        getStatus: jest.fn().mockResolvedValue({
          apiKeyConfigured: null,
          message: 'ollama ready',
          model: 'gemma3:1b',
          provider: 'ollama',
          reachable: true,
          status: 'ready',
        }),
      } as unknown as OllamaProviderStatusService,
      {
        getStatus: jest.fn().mockResolvedValue({
          apiKeyConfigured: true,
          message: 'xai ready',
          model: 'grok-4',
          provider: 'xai',
          reachable: true,
          status: 'ready',
        }),
      } as unknown as XaiProviderStatusService,
    );

    await expect(service.getStatus()).resolves.toEqual({
      apiKeyConfigured: null,
      message: 'ollama ready',
      model: 'gemma3:1b',
      provider: 'ollama',
      reachable: true,
      status: 'ready',
    });
  });
});
