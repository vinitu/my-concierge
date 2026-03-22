import { ConfigService } from '@nestjs/config';
import { OllamaProviderStatusService } from './ollama-provider-status.service';

describe('OllamaProviderStatusService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns ready when Ollama is reachable and model is available', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({
        models: [
          {
            name: 'gemma3:1b',
          },
        ],
      }),
      ok: true,
    } as Response);
    const service = new OllamaProviderStatusService(
      new ConfigService({
        OLLAMA_BASE_URL: 'http://host.docker.internal:11434',
        OLLAMA_MODEL: 'gemma3:1b',
      }),
    );

    await expect(service.getStatus()).resolves.toEqual({
      apiKeyConfigured: null,
      message: 'Ollama API is reachable and the configured model is available',
      model: 'gemma3:1b',
      provider: 'ollama',
      reachable: true,
      status: 'ready',
    });
  });

  it('returns error when the configured model is missing', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({
        models: [
          {
            name: 'llama3.2',
          },
        ],
      }),
      ok: true,
    } as Response);
    const service = new OllamaProviderStatusService(
      new ConfigService({
        OLLAMA_MODEL: 'gemma3:1b',
      }),
    );

    await expect(service.getStatus()).resolves.toEqual({
      apiKeyConfigured: null,
      message: 'Ollama is reachable, but model gemma3:1b is not available locally',
      model: 'gemma3:1b',
      provider: 'ollama',
      reachable: false,
      status: 'error',
    });
  });
});
