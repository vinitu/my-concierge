import { AssistantWorkerConfigService } from './assistant-worker-config.service';
import { XaiProviderStatusService } from './xai-provider-status.service';

describe('XaiProviderStatusService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns missing_key when XAI_API_KEY is not configured', async () => {
    const service = new XaiProviderStatusService(
      {
        read: jest.fn().mockResolvedValue({
          deepseek_api_key: '',
          deepseek_base_url: 'https://api.deepseek.com',
          deepseek_timeout_ms: 360000,
          memory_window: 3,
          model: 'grok-4-latest',
          ollama_base_url: 'http://host.docker.internal:11434',
          ollama_timeout_ms: 360000,
          provider: 'xai',
          thinking_interval_seconds: 2,
          xai_api_key: '',
          xai_base_url: 'https://api.x.ai/v1',
          xai_timeout_ms: 360000,
        }),
      } as unknown as AssistantWorkerConfigService,
    );

    await expect(service.getStatus()).resolves.toEqual({
      apiKeyConfigured: false,
      message: 'xAI API key is not configured in assistant-worker web settings',
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
        read: jest.fn().mockResolvedValue({
          deepseek_api_key: '',
          deepseek_base_url: 'https://api.deepseek.com',
          deepseek_timeout_ms: 360000,
          memory_window: 3,
          model: 'grok-4-latest',
          ollama_base_url: 'http://host.docker.internal:11434',
          ollama_timeout_ms: 360000,
          provider: 'xai',
          thinking_interval_seconds: 2,
          xai_api_key: 'test-key',
          xai_base_url: 'https://api.x.ai/v1',
          xai_timeout_ms: 360000,
        }),
      } as unknown as AssistantWorkerConfigService,
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
        read: jest.fn().mockResolvedValue({
          deepseek_api_key: '',
          deepseek_base_url: 'https://api.deepseek.com',
          deepseek_timeout_ms: 360000,
          memory_window: 3,
          model: 'grok-4-latest',
          ollama_base_url: 'http://host.docker.internal:11434',
          ollama_timeout_ms: 360000,
          provider: 'xai',
          thinking_interval_seconds: 2,
          xai_api_key: 'bad-key',
          xai_base_url: 'https://api.x.ai/v1',
          xai_timeout_ms: 360000,
        }),
      } as unknown as AssistantWorkerConfigService,
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
