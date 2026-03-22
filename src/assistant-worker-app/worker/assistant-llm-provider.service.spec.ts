import { AssistantLlmProviderService } from './assistant-llm-provider.service';
import { AssistantWorkerConfigService } from './assistant-worker-config.service';
import { GrokResponsesService } from './grok-responses.service';
import { OllamaChatService } from './ollama-chat.service';

describe('AssistantLlmProviderService', () => {
  it('routes requests to xai when configured', async () => {
    const service = new AssistantLlmProviderService(
      {
        read: jest.fn().mockResolvedValue({ provider: 'xai' }),
      } as unknown as AssistantWorkerConfigService,
      {
        generateReply: jest.fn().mockResolvedValue('xai reply'),
      } as unknown as GrokResponsesService,
      {
        generateReply: jest.fn().mockResolvedValue('ollama reply'),
      } as unknown as OllamaChatService,
    );

    await expect(
      service.generateReply({
        callback_url: 'http://example.test/callback',
        chat: 'direct',
        contact: 'alex',
        direction: 'api',
        message: 'hello',
      }),
    ).resolves.toBe('xai reply');
  });

  it('routes requests to ollama when configured', async () => {
    const ollamaChatService = {
      generateReply: jest.fn().mockResolvedValue('ollama reply'),
    } as unknown as OllamaChatService;
    const service = new AssistantLlmProviderService(
      {
        read: jest.fn().mockResolvedValue({ provider: 'ollama' }),
      } as unknown as AssistantWorkerConfigService,
      {
        generateReply: jest.fn().mockResolvedValue('xai reply'),
      } as unknown as GrokResponsesService,
      ollamaChatService,
    );

    await expect(
      service.generateReply({
        callback_url: 'http://example.test/callback',
        chat: 'direct',
        contact: 'alex',
        direction: 'api',
        message: 'hello',
      }),
    ).resolves.toBe('ollama reply');
  });
});
