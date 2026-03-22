import { ConfigService } from '@nestjs/config';
import { AssistantWorkerConfigService } from './assistant-worker-config.service';
import { DeepseekProviderStatusService } from './deepseek-provider-status.service';

describe('DeepseekProviderStatusService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns missing_key when DEEPSEEK_API_KEY is not configured', async () => {
    const service = new DeepseekProviderStatusService(
      {
        read: jest.fn().mockResolvedValue({ memory_window: 3, model: 'deepseek-reasoner', provider: 'deepseek' }),
      } as unknown as AssistantWorkerConfigService,
      new ConfigService({}),
    );

    await expect(service.getStatus()).resolves.toEqual({
      apiKeyConfigured: false,
      message: 'DEEPSEEK_API_KEY is not configured',
      model: 'deepseek-reasoner',
      provider: 'deepseek',
      reachable: false,
      status: 'missing_key',
    });
  });

  it('returns ready when DeepSeek models endpoint is reachable', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
    } as Response);
    const service = new DeepseekProviderStatusService(
      {
        read: jest.fn().mockResolvedValue({ memory_window: 3, model: 'deepseek-reasoner', provider: 'deepseek' }),
      } as unknown as AssistantWorkerConfigService,
      new ConfigService({
        DEEPSEEK_API_KEY: 'test-key',
      }),
    );

    await expect(service.getStatus()).resolves.toEqual({
      apiKeyConfigured: true,
      message: 'DeepSeek API is reachable',
      model: 'deepseek-reasoner',
      provider: 'deepseek',
      reachable: true,
      status: 'ready',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/models',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer test-key',
        },
        method: 'GET',
      }),
    );
  });
});
