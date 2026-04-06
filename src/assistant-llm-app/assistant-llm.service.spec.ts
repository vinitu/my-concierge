import { AssistantLlmService } from './assistant-llm.service';
import { AssistantLlmConfigService } from './assistant-llm-config.service';
import { DeepseekChatService } from './deepseek-chat.service';
import { DeepseekProviderStatusService } from './deepseek-provider-status.service';
import { GrokResponsesService } from './grok-responses.service';
import { OllamaChatService } from './ollama-chat.service';
import { OllamaProviderStatusService } from './ollama-provider-status.service';
import { XaiProviderStatusService } from './xai-provider-status.service';

describe('AssistantLlmService', () => {
  it('returns a static model catalog and disables key-based providers when API key is missing', async () => {
    const service = new AssistantLlmService(
      {
        read: jest.fn().mockResolvedValue({
          deepseek_api_key: '',
          deepseek_base_url: 'https://api.deepseek.com',
          deepseek_timeout_ms: 360000,
          model: 'qwen3:1.7b',
          ollama_base_url: 'http://ollama.local',
          ollama_timeout_ms: 360000,
          provider: 'ollama',
          response_repair_attempts: 1,
          xai_api_key: '',
          xai_base_url: 'https://api.x.ai/v1',
          xai_timeout_ms: 360000,
        }),
      } as unknown as AssistantLlmConfigService,
      {} as DeepseekChatService,
      {} as GrokResponsesService,
      {} as OllamaChatService,
      {} as DeepseekProviderStatusService,
      {
        getEnabledModelsSnapshot: jest
          .fn()
          .mockReturnValue(['qwen3:1.7b', 'llama3.2:3b']),
      } as unknown as OllamaProviderStatusService,
      {} as XaiProviderStatusService,
    );

    await expect(service.models()).resolves.toEqual({
      deepseek: [
        { enabled: false, name: 'deepseek-chat', status: 'API key is missing' },
        { enabled: false, name: 'deepseek-reasoner', status: 'API key is missing' },
      ],
      ollama: [
        { enabled: true, name: 'qwen3:1.7b', status: null },
        { enabled: true, name: 'llama3.2:3b', status: null },
        { enabled: false, name: 'hermes3:3b', status: 'Model is not available locally' },
      ],
      xai: [
        { enabled: false, name: 'grok-4', status: 'API key is missing' },
        { enabled: false, name: 'grok-4-latest', status: 'API key is missing' },
      ],
    });
  });

  it('downloads a supported Ollama model and returns refreshed status', async () => {
    const downloadModel = jest.fn().mockResolvedValue(undefined);
    const getEnabledModelsSnapshot = jest
      .fn()
      .mockReturnValueOnce(['qwen3:1.7b'])
      .mockReturnValueOnce(['qwen3:1.7b', 'hermes3:3b']);

    const service = new AssistantLlmService(
      {} as AssistantLlmConfigService,
      {} as DeepseekChatService,
      {} as GrokResponsesService,
      {} as OllamaChatService,
      {} as DeepseekProviderStatusService,
      {
        downloadModel,
        getEnabledModelsSnapshot,
      } as unknown as OllamaProviderStatusService,
      {} as XaiProviderStatusService,
    );

    await expect(service.downloadOllamaModel('hermes3:3b')).resolves.toEqual({
      enabled: true,
      model: 'hermes3:3b',
      provider: 'ollama',
      status: 'ok',
    });
    expect(downloadModel).toHaveBeenCalledWith('hermes3:3b');
  });

  it('repairs an unparseable conversation response with an additional provider call', async () => {
    const generateFromMessages = jest
      .fn()
      .mockResolvedValueOnce('directory_list path=.')
      .mockResolvedValueOnce('{"type":"tool_call","tool_name":"directory_list","tool_arguments":{"path":"."},"message":""}');
    const service = new AssistantLlmService(
      {
        read: jest.fn().mockResolvedValue({
          deepseek_api_key: '',
          deepseek_base_url: 'https://api.deepseek.com',
          deepseek_timeout_ms: 360000,
          model: 'deepseek-chat',
          ollama_base_url: 'http://ollama.local',
          ollama_timeout_ms: 360000,
          provider: 'deepseek',
          response_repair_attempts: 1,
          xai_api_key: '',
          xai_base_url: 'https://api.x.ai/v1',
          xai_timeout_ms: 360000,
        }),
      } as unknown as AssistantLlmConfigService,
      {
        generateFromMessages,
      } as unknown as DeepseekChatService,
      {} as GrokResponsesService,
      {} as OllamaChatService,
      {} as DeepseekProviderStatusService,
      {} as OllamaProviderStatusService,
      {} as XaiProviderStatusService,
    );

    await expect(
      service.generateConversationResponse(
        [{ content: 'какие у меня есть файлы?', role: 'user' }],
        [{ description: 'List files', name: 'directory_list' }],
      ),
    ).resolves.toEqual({
      message: '',
      tool_arguments: { path: '.' },
      tool_name: 'directory_list',
      type: 'tool_call',
    });

    expect(generateFromMessages).toHaveBeenCalledTimes(2);
    expect(generateFromMessages.mock.calls[1]?.[1]).toBeUndefined();
    expect(generateFromMessages.mock.calls[1]?.[0]).toEqual([
      expect.objectContaining({ role: 'system' }),
      expect.objectContaining({ role: 'user' }),
    ]);
  });

  it('falls back to plain final message after repair attempts are exhausted', async () => {
    const generateFromMessages = jest
      .fn()
      .mockResolvedValueOnce('not json')
      .mockResolvedValueOnce('still not json');
    const service = new AssistantLlmService(
      {
        read: jest.fn().mockResolvedValue({
          deepseek_api_key: '',
          deepseek_base_url: 'https://api.deepseek.com',
          deepseek_timeout_ms: 360000,
          model: 'deepseek-chat',
          ollama_base_url: 'http://ollama.local',
          ollama_timeout_ms: 360000,
          provider: 'deepseek',
          response_repair_attempts: 1,
          xai_api_key: '',
          xai_base_url: 'https://api.x.ai/v1',
          xai_timeout_ms: 360000,
        }),
      } as unknown as AssistantLlmConfigService,
      {
        generateFromMessages,
      } as unknown as DeepseekChatService,
      {} as GrokResponsesService,
      {} as OllamaChatService,
      {} as DeepseekProviderStatusService,
      {} as OllamaProviderStatusService,
      {} as XaiProviderStatusService,
    );

    await expect(
      service.generateConversationResponse(
        [{ content: 'привет', role: 'user' }],
        [],
      ),
    ).resolves.toEqual({
      message: 'still not json',
      type: 'final',
    });
  });
});
