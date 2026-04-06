import { OllamaChatService } from './ollama-chat.service';
import { AssistantLlmConfigService } from './assistant-llm-config.service';

describe('OllamaChatService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('fails with a clear error when Ollama model rejects tool support', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: 'registry.ollama.ai/library/gemma3:1b does not support tools',
          }),
          {
            status: 400,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: {
              content: '{"type":"final","message":"fallback without tools"}',
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );

    global.fetch = fetchMock as typeof fetch;

    const service = new OllamaChatService({
      read: jest.fn().mockResolvedValue({
        deepseek_api_key: '',
        deepseek_base_url: '',
        deepseek_timeout_ms: 360000,
        model: 'gemma3:1b',
        ollama_base_url: 'http://ollama.local',
        ollama_timeout_ms: 30000,
        provider: 'ollama',
        xai_api_key: '',
        xai_base_url: '',
        xai_timeout_ms: 360000,
      }),
    } as unknown as AssistantLlmConfigService);

    await expect(
      service.generateFromMessages(
        [{ content: 'hi', role: 'user' }],
        [{ description: 'Return current time', name: 'time_current', use_when: 'needed' }],
      ),
    ).rejects.toThrow(
      'Ollama model gemma3:1b does not support native tool calling. Choose a tools-capable model in assistant-llm settings, for example qwen3:1.7b, llama3.2:3b, or hermes3:3b.',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://ollama.local/api/chat');

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(firstBody.tools).toHaveLength(1);
  });

  it('normalizes Ollama native tool_calls into canonical tool_call json', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: {
            content: '',
            tool_calls: [
              {
                function: {
                  arguments: { path: '.' },
                  name: 'directory_list',
                },
              },
            ],
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    ) as typeof fetch;

    const service = new OllamaChatService({
      read: jest.fn().mockResolvedValue({
        deepseek_api_key: '',
        deepseek_base_url: '',
        deepseek_timeout_ms: 360000,
        model: 'qwen3:1.7b',
        ollama_base_url: 'http://ollama.local',
        ollama_timeout_ms: 30000,
        provider: 'ollama',
        xai_api_key: '',
        xai_base_url: '',
        xai_timeout_ms: 360000,
      }),
    } as unknown as AssistantLlmConfigService);

    await expect(
      service.generateFromMessages(
        [{ content: 'какие у меня есть файлы?', role: 'user' }],
        [{ description: 'List files in one directory', name: 'directory_list', use_when: 'needed' }],
      ),
    ).resolves.toBe(
      '{"message":"","tool_arguments":{"path":"."},"tool_name":"directory_list","type":"tool_call"}',
    );
  });
});
