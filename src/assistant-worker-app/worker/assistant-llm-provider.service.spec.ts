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
        generateText: jest.fn().mockResolvedValue('deepseek reply'),
      } as unknown as DeepseekChatService,
      {
        generateText: jest.fn().mockResolvedValue('xai reply'),
      } as unknown as GrokResponsesService,
      {
        generateText: jest.fn().mockResolvedValue('ollama reply'),
      } as unknown as OllamaChatService,
    );

    await expect(service.generateText('prompt')).resolves.toEqual('xai reply');
  });

  it('routes requests to ollama when configured', async () => {
    const ollamaChatService = {
      generateText: jest.fn().mockResolvedValue('ollama reply'),
    } as unknown as OllamaChatService;
    const service = new AssistantLlmProviderService(
      {
        read: jest.fn().mockResolvedValue({ provider: 'ollama' }),
      } as unknown as AssistantWorkerConfigService,
      {
        generateText: jest.fn().mockResolvedValue('deepseek reply'),
      } as unknown as DeepseekChatService,
      {
        generateText: jest.fn().mockResolvedValue('xai reply'),
      } as unknown as GrokResponsesService,
      ollamaChatService,
    );

    await expect(service.generateText('prompt')).resolves.toEqual('ollama reply');
  });

  it('routes requests to deepseek when configured', async () => {
    const deepseekChatService = {
      generateText: jest.fn().mockResolvedValue('deepseek reply'),
    } as unknown as DeepseekChatService;
    const service = new AssistantLlmProviderService(
      {
        read: jest.fn().mockResolvedValue({ provider: 'deepseek' }),
      } as unknown as AssistantWorkerConfigService,
      deepseekChatService,
      {
        generateText: jest.fn().mockResolvedValue('xai reply'),
      } as unknown as GrokResponsesService,
      {
        generateText: jest.fn().mockResolvedValue('ollama reply'),
      } as unknown as OllamaChatService,
    );

    await expect(service.generateText('prompt')).resolves.toEqual('deepseek reply');
  });
});
