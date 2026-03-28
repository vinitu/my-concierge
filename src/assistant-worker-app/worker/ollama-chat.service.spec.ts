import { AssistantWorkerConfigService } from './assistant-worker-config.service';
import { OllamaChatService } from './ollama-chat.service';

describe('OllamaChatService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends a non-streaming chat request to Ollama and returns assistant text', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({
        message: {
          content: '{"message":"Everything looks normal.","context":"Home status is normal."}',
        },
      }),
      ok: true,
    } as Response);
    const service = new OllamaChatService(
      {
        read: jest.fn().mockResolvedValue({
          deepseek_api_key: '',
          deepseek_base_url: 'https://api.deepseek.com',
          deepseek_timeout_ms: 360000,
          memory_window: 3,
          model: 'deepseek-r1:latest',
          ollama_base_url: 'http://host.docker.internal:11434',
          ollama_timeout_ms: 360000,
          provider: 'ollama',
          thinking_interval_seconds: 2,
          xai_api_key: '',
          xai_base_url: 'https://api.x.ai/v1',
          xai_timeout_ms: 360000,
        }),
      } as unknown as AssistantWorkerConfigService,
    );

    await expect(service.generateText('Summarize the house status')).resolves.toEqual(
      '{"message":"Everything looks normal.","context":"Home status is normal."}',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://host.docker.internal:11434/api/chat',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    );
    const call = fetchMock.mock.calls[0];
    const init = call?.[1];

    if (!init || typeof init.body !== 'string') {
      throw new Error('fetch body is missing');
    }

    expect(JSON.parse(init.body).model).toBe('deepseek-r1:latest');
  });

  it('rejects non-json assistant replies from Ollama', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({
        message: {
          content: 'Everything looks normal.',
        },
      }),
      ok: true,
    } as Response);
    const service = new OllamaChatService(
      {
        read: jest.fn().mockResolvedValue({
          deepseek_api_key: '',
          deepseek_base_url: 'https://api.deepseek.com',
          deepseek_timeout_ms: 360000,
          memory_window: 3,
          model: 'gemma3:1b',
          ollama_base_url: 'http://host.docker.internal:11434',
          ollama_timeout_ms: 360000,
          provider: 'ollama',
          thinking_interval_seconds: 2,
          xai_api_key: '',
          xai_base_url: 'https://api.x.ai/v1',
          xai_timeout_ms: 360000,
        }),
      } as unknown as AssistantWorkerConfigService,
    );

    await expect(service.generateText('prompt')).resolves.toEqual('Everything looks normal.');
  });
});
