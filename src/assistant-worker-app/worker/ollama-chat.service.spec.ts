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
          run_timeout_seconds: 30,
          small_model_safe_mode: false,
          structured_mode: true,
          thinking_interval_seconds: 2,
          xai_api_key: '',
          xai_base_url: 'https://api.x.ai/v1',
          xai_timeout_ms: 360000,
          enabled_tools: [],
          brave_api_key: '',
          brave_base_url: '',
          brave_timeout_ms: 30000,
        }),
      } as unknown as AssistantWorkerConfigService,
    );

    await expect(
      service.generateFromMessages([
        {
          content: 'You are the planning phase of the assistant runtime.',
          role: 'system',
        },
      ]),
    ).resolves.toEqual(
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
    expect(JSON.parse(init.body).think).toBe(false);
    expect(JSON.parse(init.body).format).toBeDefined();
    expect(Array.isArray(JSON.parse(init.body).tools)).toBe(true);
  });

  it('returns non-json assistant replies from Ollama as-is', async () => {
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
          run_timeout_seconds: 30,
          small_model_safe_mode: false,
          structured_mode: true,
          thinking_interval_seconds: 2,
          xai_api_key: '',
          xai_base_url: 'https://api.x.ai/v1',
          xai_timeout_ms: 360000,
          enabled_tools: [],
          brave_api_key: '',
          brave_base_url: '',
          brave_timeout_ms: 30000,
        }),
      } as unknown as AssistantWorkerConfigService,
    );

    await expect(
      service.generateFromMessages([{ content: 'prompt', role: 'system' }]),
    ).resolves.toEqual('Everything looks normal.');
  });

  it('does not send structured format/tools for summary mode', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({
        message: {
          content: 'Short summary.',
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
          run_timeout_seconds: 30,
          small_model_safe_mode: false,
          structured_mode: true,
          thinking_interval_seconds: 2,
          xai_api_key: '',
          xai_base_url: 'https://api.x.ai/v1',
          xai_timeout_ms: 360000,
          enabled_tools: [],
          brave_api_key: '',
          brave_base_url: '',
          brave_timeout_ms: 30000,
        }),
      } as unknown as AssistantWorkerConfigService,
    );

    await expect(
      service.summarizeConversation([{ content: 'hello', role: 'user' }], 'prev'),
    ).resolves.toEqual('Short summary.');

    const call = fetchMock.mock.calls[0];
    const init = call?.[1];
    if (!init || typeof init.body !== 'string') {
      throw new Error('fetch body is missing');
    }

    const payload = JSON.parse(init.body);
    expect(payload.think).toBe(false);
    expect(payload.format).toBeUndefined();
    expect(payload.tools).toBeUndefined();
  });

  it('does not send structured format/tools when structured mode is disabled', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({
        message: {
          content: 'Привет!',
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
          model: 'qwen3:1.7b',
          ollama_base_url: 'http://host.docker.internal:11434',
          ollama_timeout_ms: 360000,
          provider: 'ollama',
          run_timeout_seconds: 30,
          small_model_safe_mode: true,
          structured_mode: false,
          thinking_interval_seconds: 2,
          xai_api_key: '',
          xai_base_url: 'https://api.x.ai/v1',
          xai_timeout_ms: 360000,
          enabled_tools: [],
          brave_api_key: '',
          brave_base_url: '',
          brave_timeout_ms: 30000,
        }),
      } as unknown as AssistantWorkerConfigService,
    );

    await expect(
      service.generateFromMessages([
        { content: 'You are the planning phase of the assistant runtime.', role: 'system' },
        { content: 'привет', role: 'user' },
      ]),
    ).resolves.toEqual('Привет!');

    const call = fetchMock.mock.calls[0];
    const init = call?.[1];
    if (!init || typeof init.body !== 'string') {
      throw new Error('fetch body is missing');
    }

    const payload = JSON.parse(init.body);
    expect(payload.think).toBe(false);
    expect(payload.format).toBeUndefined();
    expect(payload.tools).toBeUndefined();
  });
});
