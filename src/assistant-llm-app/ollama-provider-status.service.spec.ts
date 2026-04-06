import { AssistantLlmConfigService } from './assistant-llm-config.service';
import { OllamaProviderStatusService } from './ollama-provider-status.service';

describe('OllamaProviderStatusService', () => {
  const read = jest.fn().mockResolvedValue({
    deepseek_api_key: '',
    deepseek_base_url: 'https://api.deepseek.com',
    deepseek_timeout_ms: 360000,
    model: 'qwen3:1.7b',
    ollama_base_url: 'http://ollama.local',
    ollama_timeout_ms: 360000,
    provider: 'ollama',
    xai_api_key: '',
    xai_base_url: 'https://api.x.ai/v1',
    xai_timeout_ms: 360000,
  });

  beforeEach(() => {
    read.mockClear();
    global.fetch = jest.fn();
  });

  it('reports Ollama as disabled when tags API responds but the selected model is missing', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        models: [{ name: 'llama3.2:3b' }],
      }),
      ok: true,
    });

    const service = new OllamaProviderStatusService({
      read,
    } as unknown as AssistantLlmConfigService);

    await expect(service.getStatus()).resolves.toEqual({
      enabled: false,
      model: 'qwen3:1.7b',
      provider: 'ollama',
      status: 'Ollama is reachable, but model qwen3:1.7b is not available locally',
    });
  });

  it('reports Ollama as disabled when tags API cannot be reached', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('connect ECONNREFUSED'));

    const service = new OllamaProviderStatusService({
      read,
    } as unknown as AssistantLlmConfigService);

    await expect(service.getStatus()).resolves.toEqual({
      enabled: false,
      model: 'qwen3:1.7b',
      provider: 'ollama',
      status: 'Ollama API is not reachable',
    });
  });

  it('keeps non-tools local models disabled at startup', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        models: [{ name: 'gemma3:1b' }, { name: 'qwen3:1.7b' }],
      }),
      ok: true,
    });

    const service = new OllamaProviderStatusService({
      read,
    } as unknown as AssistantLlmConfigService);

    await service.onModuleInit();

    expect(service.getAvailableModelsSnapshot()).toEqual(['gemma3:1b', 'qwen3:1.7b']);
    expect(service.getEnabledModelsSnapshot()).toEqual(['qwen3:1.7b']);
  });

  it('downloads an Ollama model and refreshes enabled snapshots', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue('{"status":"success"}'),
      })
      .mockResolvedValueOnce({
        json: jest.fn().mockResolvedValue({
          models: [{ name: 'qwen3:1.7b' }, { name: 'hermes3:3b' }],
        }),
        ok: true,
      });

    const service = new OllamaProviderStatusService({
      read,
    } as unknown as AssistantLlmConfigService);

    await service.downloadModel('hermes3:3b');

    expect(service.getEnabledModelsSnapshot()).toEqual(['qwen3:1.7b', 'hermes3:3b']);
    expect((global.fetch as jest.Mock).mock.calls[0]?.[0]).toBe('http://ollama.local/api/pull');
  });
});
