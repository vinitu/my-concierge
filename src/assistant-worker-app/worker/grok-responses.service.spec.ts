import { AssistantWorkerConfigService } from './assistant-worker-config.service';
import { GrokResponsesService } from './grok-responses.service';

describe('GrokResponsesService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends the worker prompt to xAI Responses API and returns assistant text', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({
        output: [
          {
            content: [
              {
                text: '{"message":"Kitchen lights are on.","context":"The kitchen lights are currently on."}',
                type: 'output_text',
              },
            ],
            role: 'assistant',
            type: 'message',
          },
        ],
      }),
      ok: true,
    } as Response);
    const service = new GrokResponsesService(
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

    await expect(service.generateText('Turn on the kitchen lights')).resolves.toEqual(
      '{"message":"Kitchen lights are on.","context":"The kitchen lights are currently on."}',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.x.ai/v1/responses',
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

    expect(JSON.parse(init.body)).toEqual({
      input: [
        {
          content: 'Turn on the kitchen lights',
          role: 'system',
        },
      ],
      model: 'grok-4-latest',
      store: false,
    });
  });

  it('fails fast when XAI_API_KEY is missing', async () => {
    const service = new GrokResponsesService(
      {
        read: jest.fn().mockResolvedValue({
          deepseek_api_key: '',
          deepseek_base_url: 'https://api.deepseek.com',
          deepseek_timeout_ms: 360000,
          memory_window: 3,
          model: 'grok-4',
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

    await expect(service.generateText('prompt')).rejects.toThrow(
      'xAI API key is not configured in assistant-worker web settings',
    );
  });

  it('rejects non-json assistant replies from xAI', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({
        output: [
          {
            content: [
              {
                text: 'Kitchen lights are on.',
                type: 'output_text',
              },
            ],
            role: 'assistant',
            type: 'message',
          },
        ],
      }),
      ok: true,
    } as Response);
    const service = new GrokResponsesService(
      {
        read: jest.fn().mockResolvedValue({
          deepseek_api_key: '',
          deepseek_base_url: 'https://api.deepseek.com',
          deepseek_timeout_ms: 360000,
          memory_window: 3,
          model: 'grok-4',
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

    await expect(service.generateText('prompt')).resolves.toEqual('Kitchen lights are on.');
  });
});
