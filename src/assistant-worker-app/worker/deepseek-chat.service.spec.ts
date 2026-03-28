import { AssistantWorkerConfigService } from './assistant-worker-config.service';
import { DeepseekChatService } from './deepseek-chat.service';

describe('DeepseekChatService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends an OpenAI-compatible chat request to DeepSeek and returns assistant text', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"message":"Everything looks normal.","context":"The active topic is current house status."}',
            },
          },
        ],
      }),
      ok: true,
    } as Response);
    const service = new DeepseekChatService(
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

    await expect(
      service.generateFromMessages([{ content: 'prompt', role: 'system' }]),
    ).resolves.toEqual(
      '{"message":"Everything looks normal.","context":"The active topic is current house status."}',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
          'Content-Type': 'application/json',
        }),
        method: 'POST',
      }),
    );
    const call = fetchMock.mock.calls[0];
    const init = call?.[1];

    if (!init || typeof init.body !== 'string') {
      throw new Error('fetch body is missing');
    }

    expect(JSON.parse(init.body).model).toBe('deepseek-reasoner');
  });

  it('fails fast when DEEPSEEK_API_KEY is missing', async () => {
    const service = new DeepseekChatService(
      {
        read: jest.fn().mockResolvedValue({
          deepseek_api_key: '',
          deepseek_base_url: 'https://api.deepseek.com',
          deepseek_timeout_ms: 360000,
          memory_window: 3,
          model: 'deepseek-chat',
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

    await expect(
      service.generateFromMessages([{ content: 'prompt', role: 'system' }]),
    ).rejects.toThrow(
      'DeepSeek API key is not configured in assistant-worker web settings',
    );
  });
});
