import { GatewayWebRuntimeService } from './gateway-web-runtime.service';
import { GatewayWebConfigService } from './gateway-web-config.service';

describe('GatewayWebRuntimeService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('reads conversation history from assistant-memory', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          chat: 'direct',
          contact: 'default-user',
          context: '',
          direction: 'api',
          messages: [
            {
              content: 'hello',
              created_at: '2026-03-28T10:00:00.000Z',
              role: 'user',
            },
          ],
          updated_at: '2026-03-28T10:00:00.000Z',
        }),
        {
          headers: {
            'content-type': 'application/json',
          },
          status: 200,
        },
      ),
    ) as typeof fetch;

    const configService = {
      read: jest.fn().mockResolvedValue({
        assistant_api_url: 'http://assistant-api:3000',
        assistant_memory_url: 'http://assistant-memory:3000',
        callback_base_url: 'http://gateway-web:3000',
        user_id: 'default-user',
      }),
    } as unknown as GatewayWebConfigService;
    const service = new GatewayWebRuntimeService(configService);

    await expect(
      service.readConversation('default-user', 'conv-1'),
    ).resolves.toEqual({
      conversation_id: 'conv-1',
      messages: [
        expect.objectContaining({
          content: 'hello',
          role: 'user',
        }),
      ],
      updated_at: '2026-03-28T10:00:00.000Z',
      user_id: 'default-user',
    });
  });

  it('returns empty state when assistant-memory is unavailable', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ message: 'down' }), { status: 503 })) as typeof fetch;

    const configService = {
      read: jest.fn().mockResolvedValue({
        assistant_api_url: 'http://assistant-api:3000',
        assistant_memory_url: 'http://assistant-memory:3000',
        callback_base_url: 'http://gateway-web:3000',
        user_id: 'default-user',
      }),
    } as unknown as GatewayWebConfigService;
    const service = new GatewayWebRuntimeService(configService);

    await expect(
      service.readConversation('default-user', 'conv-1'),
    ).resolves.toEqual({
      conversation_id: 'conv-1',
      messages: [],
      updated_at: null,
      user_id: 'default-user',
    });
  });

  it('clearConversation returns empty state for the new conversation id', () => {
    const configService = {} as GatewayWebConfigService;
    const service = new GatewayWebRuntimeService(configService);

    expect(service.clearConversation('default-user', 'conv-2')).toEqual({
      conversation_id: 'conv-2',
      messages: [],
      updated_at: null,
      user_id: 'default-user',
    });
  });
});
