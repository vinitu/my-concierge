import { CallbackController } from './callback.controller';
import { MetricsService } from '../observability/metrics.service';
import { SessionRegistryService } from './session-registry.service';

describe('CallbackController', () => {
  it('delivers callback messages to a registered session', () => {
    const sessionRegistryService = {
      sendAssistantMessage: jest.fn().mockReturnValue(true),
    } as unknown as SessionRegistryService;
    const metricsService = {
      recordCallback: jest.fn(),
    } as unknown as MetricsService;

    const controller = new CallbackController(sessionRegistryService, metricsService);

    expect(
      controller.deliverAssistantMessage('socket-1', { message: 'hello back' }),
    ).toEqual({
      delivered: true,
      response: 'Callback delivered',
    });
  });

  it('returns not delivered when the session does not exist', () => {
    const sessionRegistryService = {
      sendAssistantMessage: jest.fn().mockReturnValue(false),
    } as unknown as SessionRegistryService;
    const metricsService = {
      recordCallback: jest.fn(),
    } as unknown as MetricsService;

    const controller = new CallbackController(sessionRegistryService, metricsService);

    expect(
      controller.deliverAssistantMessage('socket-1', { message: 'hello back' }),
    ).toEqual({
      delivered: false,
      response: 'WebSocket session not found',
    });
  });
});

