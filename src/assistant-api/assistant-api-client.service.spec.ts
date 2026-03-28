import { ConfigService } from '@nestjs/config';
import { AssistantApiClientService } from './assistant-api-client.service';
import { MetricsService } from '../observability/metrics.service';

describe('AssistantApiClientService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('sends the conversation request to assistant-api with callback routing and conversation_id', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as typeof fetch;

    const configService = new ConfigService({
      ASSISTANT_API_URL: 'http://assistant-api:3000',
      CALLBACK_BASE_URL: 'http://gateway-web:3000',
    });
    const metricsService = { recordAssistantApiRequest: jest.fn() } as unknown as MetricsService;
    const service = new AssistantApiClientService(configService, metricsService);

    await service.sendConversation({
      conversationId: 'socket-1',
      message: 'hello',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://assistant-api:3000/conversation/api/direct/socket-1',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          callback: {
            base_url: 'http://gateway-web:3000',
          },
          conversation_id: 'socket-1',
          message: 'hello',
        }),
      },
    );
  });

  it('throws when assistant-api returns a non-success status', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 503 }) as typeof fetch;

    const configService = new ConfigService({
      ASSISTANT_API_URL: 'http://assistant-api:3000',
      CALLBACK_BASE_URL: 'http://gateway-web:3000',
    });
    const metricsService = { recordAssistantApiRequest: jest.fn() } as unknown as MetricsService;
    const service = new AssistantApiClientService(configService, metricsService);

    await expect(
      service.sendConversation({
        conversationId: 'socket-1',
        message: 'hello',
      }),
    ).rejects.toThrow('assistant-api returned 503');
  });
});
