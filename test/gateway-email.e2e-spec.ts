import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { GatewayEmailAppModule } from '../src/gateway-email-app/gateway-email-app.module';
import { GatewayEmailAssistantApiClientService } from '../src/gateway-email-app/assistant-api-client.service';
import { GATEWAY_EMAIL_TRANSPORT } from '../src/gateway-email-app/gateway-email-transport';
import { GatewayEmailSyncService } from '../src/gateway-email-app/gateway-email-sync.service';

describe('gateway-email (e2e)', () => {
  let app: NestExpressApplication;
  const assistantApiClient = {
    sendConversation: jest.fn().mockResolvedValue(undefined),
  };
  const transport = {
    sendReply: jest.fn().mockResolvedValue({
      accepted_at: '2026-03-27T10:15:00.000Z',
      message_id: '<reply-1@example.com>',
    }),
    syncInbox: jest.fn().mockResolvedValue({
      last_seen_uid: 1,
      messages: [],
    }),
  };
  const syncService = {
    triggerSync: jest.fn().mockResolvedValue({
      processed: 0,
      status: 'synced',
    }),
  };

  beforeAll(async () => {
    const runtimeDirectory = await mkdtemp(join(tmpdir(), 'gateway-email-'));
    const moduleRef = await Test.createTestingModule({
      imports: [GatewayEmailAppModule],
    })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          GATEWAY_EMAIL_RUNTIME_DIR: runtimeDirectory,
        }),
      )
      .overrideProvider(GatewayEmailAssistantApiClientService)
      .useValue(assistantApiClient)
      .overrideProvider(GATEWAY_EMAIL_TRANSPORT)
      .useValue(transport)
      .overrideProvider(GatewayEmailSyncService)
      .useValue(syncService)
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
    expect(root.text).toContain('gateway-email');
    expect(root.text).toContain('Sync now');

    const status = await request(app.getHttpServer()).get('/status');
    expect(status.status).toBe(200);
    expect(status.body.service).toBe('gateway-email');
  });

  it('stores config, accepts inbound email, and replies through the callback path', async () => {
    const configResponse = await request(app.getHttpServer()).put('/config').send({
      email: 'assistant@example.com',
      password: 'secret',
      imap_host: 'imap.example.com',
      imap_port: 993,
      imap_secure: true,
      smtp_host: 'smtp.example.com',
      smtp_port: 465,
      smtp_secure: true,
      sync_delay_seconds: 60,
    });
    expect(configResponse.status).toBe(200);
    expect(configResponse.body.email).toBe('assistant@example.com');

    const inboundResponse = await request(app.getHttpServer())
      .post('/inbound/email')
      .send({
        from: 'alice@example.com',
        in_reply_to: null,
        message_id: '<msg-1@example.com>',
        received_at: '2026-03-27T10:00:00.000Z',
        references: [],
        subject: 'Dinner plans',
        text: 'Can you help plan dinner?',
        to: ['assistant@example.com'],
        transport_uid: 1,
      });

    expect(inboundResponse.status).toBe(202);
    expect(inboundResponse.body.accepted).toBe(true);
    expect(assistantApiClient.sendConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'alice@example.com',
        conversationId: expect.stringMatching(/^email_/),
        mailbox: 'INBOX',
        message: 'Can you help plan dinner?',
      }),
    );

    const conversationId = inboundResponse.body.conversation_id as string;
    const callbackResponse = await request(app.getHttpServer())
      .post(`/response/${conversationId}`)
      .send({ message: 'Yes, let us make pasta.' });

    expect(callbackResponse.status).toBe(200);
    expect(callbackResponse.body.delivered).toBe(true);
    expect(transport.sendReply).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'assistant@example.com',
      }),
      expect.objectContaining({
        in_reply_to: '<msg-1@example.com>',
        subject: 'Re: Dinner plans',
        text: 'Yes, let us make pasta.',
        to: 'alice@example.com',
      }),
    );

    const threadResponse = await request(app.getHttpServer()).get(`/threads/${conversationId}`);
    expect(threadResponse.status).toBe(200);
    expect(threadResponse.body.thread.conversation_id).toBe(conversationId);
    expect(threadResponse.body.messages).toHaveLength(2);
  });

  it('returns gateway-email metrics and sync endpoint', async () => {
    const syncResponse = await request(app.getHttpServer()).post('/sync');
    expect(syncResponse.status).toBe(200);
    expect(syncService.triggerSync).toHaveBeenCalled();

    const metricsResponse = await request(app.getHttpServer()).get('/metrics');
    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.text).toContain('incoming_messages_total');
    expect(metricsResponse.text).toContain('email_sync_runs_total');
  });

  it('returns gateway-email OpenAPI schema', async () => {
    const response = await request(app.getHttpServer()).get('/openapi.json');
    expect(response.status).toBe(200);
    expect(response.body.info.title).toBe('gateway-email');
    expect(response.body.paths['/inbound/email']).toBeDefined();
    expect(response.body.paths['/response/{conversationId}']).toBeDefined();
    expect(response.body.paths['/sync']).toBeDefined();
  });
});
