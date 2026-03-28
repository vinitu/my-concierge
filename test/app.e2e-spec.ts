import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { io } from 'socket.io-client';
import request from 'supertest';
import { AssistantApiClientService } from '../src/assistant-api/assistant-api-client.service';
import { AppModule } from '../src/app.module';
import { GATEWAY_WEB_CONVERSATION_COOKIE } from '../src/chat/gateway-web-session';

describe('gateway-web (e2e)', () => {
  let app: NestExpressApplication;
  let gatewayWebRuntimeDirectory: string;
  let serverUrl: string;
  const assistantApiClientService = {
    sendConversation: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    gatewayWebRuntimeDirectory = await mkdtemp(join(tmpdir(), 'gateway-web-runtime-'));
    process.env.GATEWAY_WEB_RUNTIME_DIR = gatewayWebRuntimeDirectory;
    process.env.GATEWAY_WEB_USER_ID = 'default-user';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AssistantApiClientService)
      .useValue(assistantApiClientService)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useStaticAssets(`${process.cwd()}/public`, {
      index: false,
    });
    await app.listen(0);

    const address = app.getHttpServer().address() as AddressInfo;
    serverUrl = `http://127.0.0.1:${String(address.port)}`;
  });

  afterAll(async () => {
    delete process.env.GATEWAY_WEB_RUNTIME_DIR;
    delete process.env.GATEWAY_WEB_USER_ID;
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the chat page on GET /', async () => {
    const response = await request(app.getHttpServer()).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('MyConcierge');
    expect(response.text).toContain('user-id-label');
    expect(response.text).toContain('conversation-id-label');
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${GATEWAY_WEB_CONVERSATION_COOKIE}=`),
      ]),
    );
  });

  it('returns service status', async () => {
    const response = await request(app.getHttpServer()).get('/status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ready: true,
      service: 'gateway-web',
      status: 'ok',
      uptime_seconds: expect.any(Number),
    });
  });

  it('returns Prometheus metrics', async () => {
    await request(app.getHttpServer()).get('/status');

    const response = await request(app.getHttpServer()).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.text).toContain('http_request_time_ms');
    expect(response.text).toContain('route="/status",service="gateway-web",response_code="200"');
    expect(response.text).toContain('endpoint_requests_total{endpoint="/metrics",service="gateway-web"}');
  });

  it('returns gateway-web OpenAPI schema', async () => {
    const response = await request(app.getHttpServer()).get('/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body.info.title).toBe('gateway-web');
    expect(response.body.paths['/response/{conversationId}']).toBeDefined();
    expect(response.body.paths['/thinking/{conversationId}']).toBeDefined();
    expect(response.body.paths['/conversation']).toBeDefined();
    expect(response.body.paths['/config']).toBeDefined();
    expect(response.body.paths['/metrics']).toBeDefined();
    expect(response.body.paths['/status']).toBeDefined();
  });

  it('accepts WebSocket chat messages and forwards them to assistant-api with user_id + conversation_id', async () => {
    const pageResponse = await request(app.getHttpServer()).get('/');
    const conversationCookie = pageResponse.headers['set-cookie'][0];
    const conversationId = conversationCookie.match(
      new RegExp(`${GATEWAY_WEB_CONVERSATION_COOKIE}=([^;]+)`),
    )?.[1];
    expect(conversationId).toBeDefined();

    const client = io(serverUrl, {
      auth: { conversationId },
      extraHeaders: {
        Cookie: conversationCookie,
      },
      path: '/ws',
      transports: ['websocket'],
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.close();
        reject(new Error('websocket timeout'));
      }, 5000);

      client.on('connect', () => {
        client.emit('chat.message', { message: 'hello assistant' });
      });

      const check = setInterval(() => {
        if (assistantApiClientService.sendConversation.mock.calls.length === 0) {
          return;
        }

        clearInterval(check);
        clearTimeout(timeout);
        expect(assistantApiClientService.sendConversation).toHaveBeenCalledWith({
          conversationId,
          message: 'hello assistant',
          userId: 'default-user',
        });
        client.close();
        resolve();
      }, 50);
    });
  });

  it('delivers callback messages back to the WebSocket conversation', async () => {
    const pageResponse = await request(app.getHttpServer()).get('/');
    const conversationCookie = pageResponse.headers['set-cookie'][0];
    const conversationId = conversationCookie.match(
      new RegExp(`${GATEWAY_WEB_CONVERSATION_COOKIE}=([^;]+)`),
    )?.[1];
    expect(conversationId).toBeDefined();

    const client = io(serverUrl, {
      auth: { conversationId },
      extraHeaders: {
        Cookie: conversationCookie,
      },
      path: '/ws',
      transports: ['websocket'],
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.close();
        reject(new Error('callback timeout'));
      }, 5000);

      client.on('connect', async () => {
        await request(app.getHttpServer())
          .post(`/response/${conversationId}`)
          .send({ message: 'assistant reply' })
          .expect(200);
      });

      client.on('assistant.message', (payload) => {
        clearTimeout(timeout);
        expect(payload).toEqual({ message: 'assistant reply' });
        client.close();
        resolve();
      });
    });
  });

  it('delivers thinking callbacks back to the WebSocket conversation', async () => {
    const pageResponse = await request(app.getHttpServer()).get('/');
    const conversationCookie = pageResponse.headers['set-cookie'][0];
    const conversationId = conversationCookie.match(
      new RegExp(`${GATEWAY_WEB_CONVERSATION_COOKIE}=([^;]+)`),
    )?.[1];
    expect(conversationId).toBeDefined();

    const client = io(serverUrl, {
      auth: { conversationId },
      extraHeaders: {
        Cookie: conversationCookie,
      },
      path: '/ws',
      transports: ['websocket'],
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.close();
        reject(new Error('thinking timeout'));
      }, 5000);

      client.on('connect', async () => {
        await request(app.getHttpServer())
          .post(`/thinking/${conversationId}`)
          .send({ seconds: 2 })
          .expect(200);
      });

      client.on('assistant.thinking', (payload) => {
        clearTimeout(timeout);
        expect(payload).toEqual({ seconds: 2 });
        client.close();
        resolve();
      });
    });
  });

  it('keeps conversation cookie stable across reload and rotates on clear', async () => {
    const firstPage = await request(app.getHttpServer()).get('/');
    const firstCookie = firstPage.headers['set-cookie'][0];
    const firstConversationId = firstCookie.match(
      new RegExp(`${GATEWAY_WEB_CONVERSATION_COOKIE}=([^;]+)`),
    )?.[1] as string;

    const secondPage = await request(app.getHttpServer())
      .get('/')
      .set('Cookie', firstCookie);
    const secondCookie = secondPage.headers['set-cookie'][0];
    const secondConversationId = secondCookie.match(
      new RegExp(`${GATEWAY_WEB_CONVERSATION_COOKIE}=([^;]+)`),
    )?.[1] as string;

    expect(secondConversationId).toBe(firstConversationId);

    const clearResponse = await request(app.getHttpServer())
      .delete('/conversation')
      .set('Cookie', firstCookie)
      .expect(200);

    expect(clearResponse.body).toEqual({
      cleared: true,
      conversation_id: expect.any(String),
      previous_conversation_id: firstConversationId,
      user_id: 'default-user',
    });
    expect(clearResponse.body.conversation_id).not.toBe(firstConversationId);
    expect(clearResponse.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          `${GATEWAY_WEB_CONVERSATION_COOKIE}=${clearResponse.body.conversation_id}`,
        ),
      ]),
    );
  });
});
