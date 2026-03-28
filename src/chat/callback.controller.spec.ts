import { CallbackController } from './callback.controller';
import { MetricsService } from '../observability/metrics.service';
import { ConversationRegistryService } from './session-registry.service';

describe('CallbackController', () => {
  it('delivers callback messages to a registered conversation', async () => {
    const conversationRegistryService = {
      sendAssistantMessage: jest.fn().mockReturnValue(true),
    } as unknown as ConversationRegistryService;
    const metricsService = {
      recordCallback: jest.fn(),
    } as unknown as MetricsService;

    const controller = new CallbackController(
      conversationRegistryService,
      metricsService,
    );

    await expect(
      controller.deliverAssistantResponse('conversation-1', { message: 'hello back' }),
    ).resolves.toEqual({
      delivered: true,
      response: 'Callback delivered',
    });
  });

  it('returns not delivered when the conversation does not exist', async () => {
    const conversationRegistryService = {
      sendAssistantMessage: jest.fn().mockReturnValue(false),
    } as unknown as ConversationRegistryService;
    const metricsService = {
      recordCallback: jest.fn(),
    } as unknown as MetricsService;

    const controller = new CallbackController(
      conversationRegistryService,
      metricsService,
    );

    await expect(
      controller.deliverAssistantResponse('conversation-1', { message: 'hello back' }),
    ).resolves.toEqual({
      delivered: false,
      response: 'WebSocket conversation not found',
    });
  });

  it('delivers error callback as assistant error event', async () => {
    const conversationRegistryService = {
      sendAssistantError: jest.fn().mockReturnValue(true),
      sendAssistantMessage: jest.fn().mockReturnValue(true),
    } as unknown as ConversationRegistryService;
    const metricsService = {
      recordCallback: jest.fn(),
    } as unknown as MetricsService;

    const controller = new CallbackController(
      conversationRegistryService,
      metricsService,
    );

    await expect(
      controller.deliverAssistantResponse('conversation-1', {
        error: true,
        message: 'The assistant run failed.',
      }),
    ).resolves.toEqual({
      delivered: true,
      response: 'Callback delivered',
    });

    expect(conversationRegistryService.sendAssistantError).toHaveBeenCalledWith(
      'conversation-1',
      'The assistant run failed.',
    );
  });

  it('delivers thinking notifications to a registered conversation', () => {
    const conversationRegistryService = {
      sendAssistantThinking: jest.fn().mockReturnValue(true),
    } as unknown as ConversationRegistryService;
    const metricsService = {
      recordCallback: jest.fn(),
    } as unknown as MetricsService;

    const controller = new CallbackController(
      conversationRegistryService,
      metricsService,
    );

    expect(controller.deliverAssistantThinking('conversation-1', { seconds: 2 })).toEqual({
      delivered: true,
      response: 'Thinking callback delivered',
    });
  });
});
