import { CallbackController } from './callback.controller';
import { GatewayWebRuntimeService } from './gateway-web-runtime.service';
import { MetricsService } from '../observability/metrics.service';
import { SessionRegistryService } from './session-registry.service';

describe('CallbackController', () => {
  it('delivers callback messages to a registered session', async () => {
    const gatewayWebRuntimeService = {
      appendAssistantMessage: jest.fn().mockResolvedValue(undefined),
    } as unknown as GatewayWebRuntimeService;
    const sessionRegistryService = {
      sendAssistantMessage: jest.fn().mockReturnValue(true),
    } as unknown as SessionRegistryService;
    const metricsService = {
      recordCallback: jest.fn(),
    } as unknown as MetricsService;

    const controller = new CallbackController(
      gatewayWebRuntimeService,
      sessionRegistryService,
      metricsService,
    );

    await expect(
      controller.deliverAssistantResponse('session-1', { message: 'hello back' }),
    ).resolves.toEqual({
      delivered: true,
      response: 'Callback delivered',
    });
    expect(gatewayWebRuntimeService.appendAssistantMessage).toHaveBeenCalledWith(
      'session-1',
      'hello back',
    );
  });

  it('returns not delivered when the session does not exist', async () => {
    const gatewayWebRuntimeService = {
      appendAssistantMessage: jest.fn().mockResolvedValue(undefined),
    } as unknown as GatewayWebRuntimeService;
    const sessionRegistryService = {
      sendAssistantMessage: jest.fn().mockReturnValue(false),
    } as unknown as SessionRegistryService;
    const metricsService = {
      recordCallback: jest.fn(),
    } as unknown as MetricsService;

    const controller = new CallbackController(
      gatewayWebRuntimeService,
      sessionRegistryService,
      metricsService,
    );

    await expect(
      controller.deliverAssistantResponse('session-1', { message: 'hello back' }),
    ).resolves.toEqual({
      delivered: false,
      response: 'WebSocket session not found',
    });
  });

  it('delivers thinking notifications to a registered session', () => {
    const gatewayWebRuntimeService = {} as unknown as GatewayWebRuntimeService;
    const sessionRegistryService = {
      sendAssistantThinking: jest.fn().mockReturnValue(true),
    } as unknown as SessionRegistryService;
    const metricsService = {
      recordCallback: jest.fn(),
    } as unknown as MetricsService;

    const controller = new CallbackController(
      gatewayWebRuntimeService,
      sessionRegistryService,
      metricsService,
    );

    expect(controller.deliverAssistantThinking('session-1', { seconds: 2 })).toEqual({
      delivered: true,
      response: 'Thinking callback delivered',
    });
  });
});
