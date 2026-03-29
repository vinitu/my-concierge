import { CallbackController } from './callback.controller';
import { MetricsService } from '../observability/metrics.service';
import { ConversationRegistryService } from './session-registry.service';
import { GatewayWebConfigService } from './gateway-web-config.service';

const allIncomingTypes = [
  'response.message',
  'response.error',
  'response.thinking',
  'event.run',
  'event.memory',
  'event.other',
];

describe('CallbackController', () => {
  it('delivers callback messages to a registered conversation', async () => {
    const conversationRegistryService = {
      sendAssistantMessage: jest.fn().mockReturnValue(true),
    } as unknown as ConversationRegistryService;
    const metricsService = {
      recordCallback: jest.fn(),
    } as unknown as MetricsService;
    const gatewayWebConfigService = {
      read: jest
        .fn()
        .mockResolvedValue({
          allowed_incoming_message_types: allIncomingTypes,
        }),
    } as unknown as GatewayWebConfigService;

    const controller = new CallbackController(
      conversationRegistryService,
      metricsService,
      gatewayWebConfigService,
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
    const gatewayWebConfigService = {
      read: jest
        .fn()
        .mockResolvedValue({
          allowed_incoming_message_types: allIncomingTypes,
        }),
    } as unknown as GatewayWebConfigService;

    const controller = new CallbackController(
      conversationRegistryService,
      metricsService,
      gatewayWebConfigService,
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
    const gatewayWebConfigService = {
      read: jest
        .fn()
        .mockResolvedValue({
          allowed_incoming_message_types: allIncomingTypes,
        }),
    } as unknown as GatewayWebConfigService;

    const controller = new CallbackController(
      conversationRegistryService,
      metricsService,
      gatewayWebConfigService,
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

  it('delivers thinking notifications to a registered conversation', async () => {
    const conversationRegistryService = {
      sendAssistantThinking: jest.fn().mockReturnValue(true),
    } as unknown as ConversationRegistryService;
    const metricsService = {
      recordCallback: jest.fn(),
    } as unknown as MetricsService;
    const gatewayWebConfigService = {
      read: jest
        .fn()
        .mockResolvedValue({
          allowed_incoming_message_types: allIncomingTypes,
        }),
    } as unknown as GatewayWebConfigService;

    const controller = new CallbackController(
      conversationRegistryService,
      metricsService,
      gatewayWebConfigService,
    );

    await expect(
      controller.deliverAssistantThinking('conversation-1', { seconds: 2 }),
    ).resolves.toEqual({
      delivered: true,
      response: 'Thinking callback delivered',
    });
  });

  it('ignores callback messages by type when disabled in settings', async () => {
    const conversationRegistryService = {
      sendAssistantError: jest.fn().mockReturnValue(true),
      sendAssistantMessage: jest.fn().mockReturnValue(true),
    } as unknown as ConversationRegistryService;
    const metricsService = {
      recordCallback: jest.fn(),
    } as unknown as MetricsService;
    const gatewayWebConfigService = {
      read: jest
        .fn()
        .mockResolvedValue({
          allowed_incoming_message_types: ['response.message'],
        }),
    } as unknown as GatewayWebConfigService;

    const controller = new CallbackController(
      conversationRegistryService,
      metricsService,
      gatewayWebConfigService,
    );

    await expect(
      controller.deliverAssistantResponse('conversation-1', {
        error: true,
        message: 'The assistant run failed.',
      }),
    ).resolves.toEqual({
      delivered: false,
      response: 'Ignored by gateway-web settings',
    });

    expect(conversationRegistryService.sendAssistantError).not.toHaveBeenCalled();
    expect(conversationRegistryService.sendAssistantMessage).not.toHaveBeenCalled();
  });

  it('ignores event callbacks by type when event group is disabled', async () => {
    const conversationRegistryService = {
      sendAssistantEvent: jest.fn().mockReturnValue(true),
    } as unknown as ConversationRegistryService;
    const metricsService = {
      recordCallback: jest.fn(),
    } as unknown as MetricsService;
    const gatewayWebConfigService = {
      read: jest
        .fn()
        .mockResolvedValue({
          allowed_incoming_message_types: ['response.message', 'response.thinking'],
        }),
    } as unknown as GatewayWebConfigService;

    const controller = new CallbackController(
      conversationRegistryService,
      metricsService,
      gatewayWebConfigService,
    );

    await expect(
      controller.deliverAssistantEvent('conversation-1', {
        type: 'run.completed',
      }),
    ).resolves.toEqual({
      delivered: false,
      response: 'Ignored by gateway-web settings',
    });

    expect(conversationRegistryService.sendAssistantEvent).not.toHaveBeenCalled();
  });
});
