import { ConfigService } from '@nestjs/config';
import { AssistantWorkerConfigService } from './assistant-worker-config.service';
import { XaiProviderStatusService } from './xai-provider-status.service';

describe('XaiProviderStatusService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns missing_key when XAI_API_KEY is not configured', async () => {
    const service = new XaiProviderStatusService(
      {
        read: jest.fn().mockResolvedValue({ memory_window: 3, model: 'grok-4-latest', provider: 'xai' }),
      } as unknown as AssistantWorkerConfigService,
      new ConfigService({}),
    );

    await expect(service.getStatus()).resolves.toEqual({
      apiKeyConfigured: false,
      message: 'XAI_API_KEY is not configured',
      model: 'grok-4-latest',
      provider: 'xai',
      reachable: false,
      status: 'missing_key',
    });
  });

  it('returns ready when xAI models endpoint is reachable', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
    } as Response);
    const service = new XaiProviderStatusService(
      {
        read: jest.fn().mockResolvedValue({ memory_window: 3, model: 'grok-4-latest', provider: 'xai' }),
      } as unknown as AssistantWorkerConfigService,
      new ConfigService({
        XAI_API_KEY: 'test-key',
      }),
    );

    await expect(service.getStatus()).resolves.toEqual({
      apiKeyConfigured: true,
      message: 'xAI API is reachable',
      model: 'grok-4-latest',
      provider: 'xai',
      reachable: true,
      status: 'ready',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.x.ai/v1/models',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer test-key',
        },
        method: 'GET',
      }),
    );
  });

  it('returns error when xAI endpoint responds with an error', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'invalid api key',
    } as Response);
    const service = new XaiProviderStatusService(
      {
        read: jest.fn().mockResolvedValue({ memory_window: 3, model: 'grok-4-latest', provider: 'xai' }),
      } as unknown as AssistantWorkerConfigService,
      new ConfigService({
        XAI_API_KEY: 'bad-key',
      }),
    );

    await expect(service.getStatus()).resolves.toEqual({
      apiKeyConfigured: true,
      message: 'xAI check failed with 401: invalid api key',
      model: 'grok-4-latest',
      provider: 'xai',
      reachable: false,
      status: 'error',
    });
  });
});
