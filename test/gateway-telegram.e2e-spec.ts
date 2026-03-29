import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { GatewayTelegramAssistantApiClientService } from '../src/gateway-telegram-app/assistant-api-client.service';
import { GatewayTelegramAppModule } from '../src/gateway-telegram-app/gateway-telegram-app.module';
import { GATEWAY_TELEGRAM_TRANSPORT } from '../src/gateway-telegram-app/gateway-telegram-transport';

describe('gateway-telegram (e2e)', () => {
  let app: NestExpressApplication;
  const assistantApiClient = {
    sendConversation: jest.fn().mockResolvedValue(undefined),
  };
  const transport = {
    sendMessage: jest.fn().mockResolvedValue({
      message_id: 2001,
      sent_at: '2026-03-27T10:15:00.000Z',
    }),
  };

  beforeAll(async () => {
    const runtimeDirectory = await mkdtemp(join(tmpdir(), 'gateway-telegram-'));
    const moduleRef = await Test.createTestingModule({
      imports: [GatewayTelegramAppModule],
    })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          GATEWAY_TELEGRAM_RUNTIME_DIR: runtimeDirectory,
        }),
      )
      .overrideProvider(GatewayTelegramAssistantApiClientService)
      .useValue(assistantApiClient)
      .overrideProvider(GATEWAY_TELEGRAM_TRANSPORT)
      .useValue(transport)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns root page and status', async () => {
    const root = await request(app.getHttpServer()).get('/');
    expect(root.status).toBe(200);
    expect(root.text).toContain('gateway-telegram');
    expect(root.text).toContain('Bot token');

    const status = await request(app.getHttpServer()).get('/status');
    expect(status.status).toBe(200);
    expect(status.body.service).toBe('gateway-telegram');
  });

  it('stores config, accepts inbound telegram, and replies through the callback path', async () => {
    const configResponse = await request(app.getHttpServer()).put('/config').send({
      bot_token: '123456:ABCDEF',
    });
    expect(configResponse.status).toBe(200);
    expect(configResponse.body.bot_token).toBe('123456:ABCDEF');

    const inboundResponse = await request(app.getHttpServer())
      .post('/inbound/telegram')
      .send({
        chat_id: '12345',
        from_id: '77',
        from_username: 'alice',
        message_id: 1001,
        message_thread_id: null,
        received_at: '2026-03-27T10:00:00.000Z',
        text: 'Can you help plan dinner?',
      });

    expect(inboundResponse.status).toBe(202);
    expect(inboundResponse.body.accepted).toBe(true);
    expect(assistantApiClient.sendConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        chat: '12345',
        userId: 'alice',
        conversationId: 'tg_12345',
        message: 'Can you help plan dinner?',
      }),
    );

    const conversationId = inboundResponse.body.conversation_id as string;
    const callbackResponse = await request(app.getHttpServer())
      .post(`/response/${conversationId}`)
      .send({ message: 'Yes, let us make pasta.' });

    expect(callbackResponse.status).toBe(200);
    expect(callbackResponse.body.delivered).toBe(true);
    expect(transport.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        bot_token: '123456:ABCDEF',
      }),
      expect.objectContaining({
        chat_id: '12345',
        reply_to_message_id: 1001,
        text: 'Yes, let us make pasta.',
      }),
    );

    const threadResponse = await request(app.getHttpServer()).get(
      `/threads/${conversationId}`,
    );
    expect(threadResponse.status).toBe(200);
    expect(threadResponse.body.thread.conversation_id).toBe(conversationId);
    expect(threadResponse.body.messages).toHaveLength(2);
  });

  it('returns gateway-telegram metrics', async () => {
    const metricsResponse = await request(app.getHttpServer()).get('/metrics');
    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.text).toContain('incoming_messages_total');
    expect(metricsResponse.text).toContain('telegram_threads_total');
  });

  it('returns gateway-telegram OpenAPI schema', async () => {
    const response = await request(app.getHttpServer()).get('/openapi.json');
    expect(response.status).toBe(200);
    expect(response.body.info.title).toBe('gateway-telegram');
    expect(response.body.paths['/inbound/telegram']).toBeDefined();
    expect(response.body.paths['/response/{conversationId}']).toBeDefined();
  });
});
