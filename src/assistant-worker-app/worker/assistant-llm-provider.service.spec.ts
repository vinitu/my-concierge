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
        generateFromMessages: jest.fn().mockResolvedValue('deepseek reply'),
        summarizeConversation: jest.fn().mockResolvedValue('deepseek summary'),
      } as unknown as DeepseekChatService,
      {
        generateFromMessages: jest.fn().mockResolvedValue('xai reply'),
        summarizeConversation: jest.fn().mockResolvedValue('xai summary'),
      } as unknown as GrokResponsesService,
      {
        generateFromMessages: jest.fn().mockResolvedValue('ollama reply'),
        summarizeConversation: jest.fn().mockResolvedValue('ollama summary'),
      } as unknown as OllamaChatService,
    );

    await expect(
      service.generateFromMessages([{ content: 'prompt', role: 'system' }]),
    ).resolves.toEqual('xai reply');
  });

  it('routes requests to ollama when configured', async () => {
    const ollamaChatService = {
      generateFromMessages: jest.fn().mockResolvedValue('ollama reply'),
      summarizeConversation: jest.fn().mockResolvedValue('ollama summary'),
    } as unknown as OllamaChatService;
    const service = new AssistantLlmProviderService(
      {
        read: jest.fn().mockResolvedValue({ provider: 'ollama' }),
      } as unknown as AssistantWorkerConfigService,
      {
        generateFromMessages: jest.fn().mockResolvedValue('deepseek reply'),
        summarizeConversation: jest.fn().mockResolvedValue('deepseek summary'),
      } as unknown as DeepseekChatService,
      {
        generateFromMessages: jest.fn().mockResolvedValue('xai reply'),
        summarizeConversation: jest.fn().mockResolvedValue('xai summary'),
      } as unknown as GrokResponsesService,
      ollamaChatService,
    );

    await expect(
      service.generateFromMessages([{ content: 'prompt', role: 'system' }]),
    ).resolves.toEqual('ollama reply');
  });

  it('routes requests to deepseek when configured', async () => {
    const deepseekChatService = {
      generateFromMessages: jest.fn().mockResolvedValue('deepseek reply'),
      summarizeConversation: jest.fn().mockResolvedValue('deepseek summary'),
    } as unknown as DeepseekChatService;
    const service = new AssistantLlmProviderService(
      {
        read: jest.fn().mockResolvedValue({ provider: 'deepseek' }),
      } as unknown as AssistantWorkerConfigService,
      deepseekChatService,
      {
        generateFromMessages: jest.fn().mockResolvedValue('xai reply'),
        summarizeConversation: jest.fn().mockResolvedValue('xai summary'),
      } as unknown as GrokResponsesService,
      {
        generateFromMessages: jest.fn().mockResolvedValue('ollama reply'),
        summarizeConversation: jest.fn().mockResolvedValue('ollama summary'),
      } as unknown as OllamaChatService,
    );

    await expect(
      service.generateFromMessages([{ content: 'prompt', role: 'system' }]),
    ).resolves.toEqual('deepseek reply');
  });

  it('routes summary requests to active provider', async () => {
    const deepseekChatService = {
      generateFromMessages: jest.fn(),
      summarizeConversation: jest.fn().mockResolvedValue('summary'),
    } as unknown as DeepseekChatService;
    const service = new AssistantLlmProviderService(
      {
        read: jest.fn().mockResolvedValue({ provider: 'deepseek' }),
      } as unknown as AssistantWorkerConfigService,
      deepseekChatService,
      {
        generateFromMessages: jest.fn(),
        summarizeConversation: jest.fn(),
      } as unknown as GrokResponsesService,
      {
        generateFromMessages: jest.fn(),
        summarizeConversation: jest.fn(),
      } as unknown as OllamaChatService,
    );

    await expect(
      service.summarizeConversation([{ content: 'msg', role: 'user' }], 'previous'),
    ).resolves.toEqual('summary');
  });
});
