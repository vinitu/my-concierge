import { AssistantLlmProviderService } from './assistant-llm-provider.service';
import { AssistantWorkerConfigService } from './assistant-worker-config.service';
import { DeepseekChatService } from './deepseek-chat.service';
import { GrokResponsesService } from './grok-responses.service';
import { OllamaChatService } from './ollama-chat.service';

describe('AssistantLlmProviderService', () => {
  it('routes requests to xai when configured', async () => {
    const service = new AssistantLlmProviderService(
      {
        read: jest.fn().mockResolvedValue({ provider: 'xai' }),
      } as unknown as AssistantWorkerConfigService,
      {
        generateReply: jest.fn().mockResolvedValue({ context: 'deepseek context', message: 'deepseek reply' }),
      } as unknown as DeepseekChatService,
      {
        generateReply: jest.fn().mockResolvedValue({ context: 'xai context', message: 'xai reply' }),
      } as unknown as GrokResponsesService,
      {
        generateReply: jest.fn().mockResolvedValue({ context: 'ollama context', message: 'ollama reply' }),
      } as unknown as OllamaChatService,
    );

    await expect(
      service.generateReply({
        conversation: {
          chat: 'direct',
          contact: 'alex',
          context: '',
          direction: 'api',
          messages: [],
          updated_at: null,
        },
        message: {
          callback_url: 'http://example.test/callback',
          chat: 'direct',
          contact: 'alex',
          direction: 'api',
          message: 'hello',
        },
      }),
    ).resolves.toEqual({ context: 'xai context', message: 'xai reply' });
  });

  it('routes requests to ollama when configured', async () => {
    const ollamaChatService = {
      generateReply: jest.fn().mockResolvedValue({ context: 'ollama context', message: 'ollama reply' }),
    } as unknown as OllamaChatService;
    const service = new AssistantLlmProviderService(
      {
        read: jest.fn().mockResolvedValue({ provider: 'ollama' }),
      } as unknown as AssistantWorkerConfigService,
      {
        generateReply: jest.fn().mockResolvedValue({ context: 'deepseek context', message: 'deepseek reply' }),
      } as unknown as DeepseekChatService,
      {
        generateReply: jest.fn().mockResolvedValue({ context: 'xai context', message: 'xai reply' }),
      } as unknown as GrokResponsesService,
      ollamaChatService,
    );

    await expect(
      service.generateReply({
        conversation: {
          chat: 'direct',
          contact: 'alex',
          context: '',
          direction: 'api',
          messages: [],
          updated_at: null,
        },
        message: {
          callback_url: 'http://example.test/callback',
          chat: 'direct',
          contact: 'alex',
          direction: 'api',
          message: 'hello',
        },
      }),
    ).resolves.toEqual({ context: 'ollama context', message: 'ollama reply' });
  });

  it('routes requests to deepseek when configured', async () => {
    const deepseekChatService = {
      generateReply: jest.fn().mockResolvedValue({ context: 'deepseek context', message: 'deepseek reply' }),
    } as unknown as DeepseekChatService;
    const service = new AssistantLlmProviderService(
      {
        read: jest.fn().mockResolvedValue({ provider: 'deepseek' }),
      } as unknown as AssistantWorkerConfigService,
      deepseekChatService,
      {
        generateReply: jest.fn().mockResolvedValue({ context: 'xai context', message: 'xai reply' }),
      } as unknown as GrokResponsesService,
      {
        generateReply: jest.fn().mockResolvedValue({ context: 'ollama context', message: 'ollama reply' }),
      } as unknown as OllamaChatService,
    );

    await expect(
      service.generateReply({
        conversation: {
          chat: 'direct',
          contact: 'alex',
          context: '',
          direction: 'api',
          messages: [],
          updated_at: null,
        },
        message: {
          callback_url: 'http://example.test/callback',
          chat: 'direct',
          contact: 'alex',
          direction: 'api',
          message: 'hello',
        },
      }),
    ).resolves.toEqual({ context: 'deepseek context', message: 'deepseek reply' });
  });
});
