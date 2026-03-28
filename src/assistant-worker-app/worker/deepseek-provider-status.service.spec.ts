import { AssistantWorkerConfigService } from './assistant-worker-config.service';
import { DeepseekProviderStatusService } from './deepseek-provider-status.service';

describe('DeepseekProviderStatusService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns missing_key when DEEPSEEK_API_KEY is not configured', async () => {
    const service = new DeepseekProviderStatusService(
      {
        read: jest.fn().mockResolvedValue({
          deepseek_api_key: '',
          deepseek_base_url: 'https://api.deepseek.com',
          deepseek_timeout_ms: 360000,
          memory_window: 3,
          model: 'deepseek-reasoner',
          ollama_base_url: 'http://host.docker.internal:11434',
          ollama_timeout_ms: 360000,
          provider: 'deepseek',
          thinking_interval_seconds: 2,
          xai_api_key: '',
          xai_base_url: 'https://api.x.ai/v1',
          xai_timeout_ms: 360000,
        }),
      } as unknown as AssistantWorkerConfigService,
    );

    await expect(service.getStatus()).resolves.toEqual({
      apiKeyConfigured: false,
      message: 'DeepSeek API key is not configured in assistant-worker web settings',
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
        read: jest.fn().mockResolvedValue({
          deepseek_api_key: 'test-key',
          deepseek_base_url: 'https://api.deepseek.com',
          deepseek_timeout_ms: 360000,
          memory_window: 3,
          model: 'deepseek-reasoner',
          ollama_base_url: 'http://host.docker.internal:11434',
          ollama_timeout_ms: 360000,
          provider: 'deepseek',
          thinking_interval_seconds: 2,
          xai_api_key: '',
          xai_base_url: 'https://api.x.ai/v1',
          xai_timeout_ms: 360000,
        }),
      } as unknown as AssistantWorkerConfigService,
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
