import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AssistantApiClientService } from '../src/assistant-api/assistant-api-client.service';
import { AppModule } from '../src/app.module';
import { GatewayWebGateway } from '../src/chat/gateway-web.gateway';
import { GATEWAY_WEB_CONVERSATION_COOKIE } from '../src/chat/gateway-web-session';

describe('gateway-web (e2e)', () => {
  let app: NestExpressApplication;
  let httpApp: Parameters<typeof request>[0];
  let gateway: GatewayWebGateway;
  let gatewayWebRuntimeDirectory: string;
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
    await app.init();
    httpApp = app.getHttpAdapter().getInstance();
    gateway = app.get(GatewayWebGateway);
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
    const response = await request(httpApp).get('/');

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
    const response = await request(httpApp).get('/status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ready: true,
      service: 'gateway-web',
      status: 'ok',
      uptime_seconds: expect.any(Number),
    });
  });

  it('returns Prometheus metrics', async () => {
    await request(httpApp).get('/status');

    const response = await request(httpApp).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.text).toContain('http_request_time_ms');
    expect(response.text).toContain('route="/status",service="gateway-web",response_code="200"');
    expect(response.text).toContain('endpoint_requests_total{endpoint="/metrics",service="gateway-web"}');
  });

  it('returns gateway-web OpenAPI schema', async () => {
    const response = await request(httpApp).get('/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body.info.title).toBe('gateway-web');
    expect(response.body.paths['/response/{conversationId}']).toBeDefined();
    expect(response.body.paths['/thinking/{conversationId}']).toBeDefined();
    expect(response.body.paths['/conversation']).toBeDefined();
    expect(response.body.paths['/config']).toBeDefined();
    expect(response.body.paths['/metrics']).toBeDefined();
    expect(response.body.paths['/status']).toBeDefined();
  });

  it('accepts chat messages through the gateway and forwards them to assistant-api with user_id + conversation_id', async () => {
    const pageResponse = await request(httpApp).get('/');
    const conversationCookie = pageResponse.headers['set-cookie'][0];
    const conversationId = conversationCookie.match(
      new RegExp(`${GATEWAY_WEB_CONVERSATION_COOKIE}=([^;]+)`),
    )?.[1];
    expect(conversationId).toBeDefined();

    const client = {
      data: {},
      emit: jest.fn(),
      handshake: {
        auth: { conversationId },
        headers: {
          cookie: conversationCookie,
        },
      },
      id: 'socket-1',
    };

    gateway.handleConnection(client as never);
    await gateway.handleMessage(client as never, { message: 'hello assistant' });

    expect(assistantApiClientService.sendConversation).toHaveBeenCalledWith({
      conversationId,
      message: 'hello assistant',
      userId: 'default-user',
    });
  });

  it('delivers callback messages back to the registered conversation', async () => {
    const pageResponse = await request(httpApp).get('/');
    const conversationCookie = pageResponse.headers['set-cookie'][0];
    const conversationId = conversationCookie.match(
      new RegExp(`${GATEWAY_WEB_CONVERSATION_COOKIE}=([^;]+)`),
    )?.[1];
    expect(conversationId).toBeDefined();

    const client = {
      data: {},
      emit: jest.fn(),
      handshake: {
        auth: { conversationId },
        headers: {
          cookie: conversationCookie,
        },
      },
      id: 'socket-2',
    };

    gateway.handleConnection(client as never);

    await request(httpApp)
      .post(`/response/${conversationId}`)
      .send({ message: 'assistant reply' })
      .expect(200);

    expect(client.emit).toHaveBeenCalledWith('assistant.message', {
      message: 'assistant reply',
    });
  });

  it('delivers thinking callbacks back to the registered conversation', async () => {
    const pageResponse = await request(httpApp).get('/');
    const conversationCookie = pageResponse.headers['set-cookie'][0];
    const conversationId = conversationCookie.match(
      new RegExp(`${GATEWAY_WEB_CONVERSATION_COOKIE}=([^;]+)`),
    )?.[1];
    expect(conversationId).toBeDefined();

    const client = {
      data: {},
      emit: jest.fn(),
      handshake: {
        auth: { conversationId },
        headers: {
          cookie: conversationCookie,
        },
      },
      id: 'socket-3',
    };

    gateway.handleConnection(client as never);

    await request(httpApp)
      .post(`/thinking/${conversationId}`)
      .send({ seconds: 2 })
      .expect(200);

    expect(client.emit).toHaveBeenCalledWith('assistant.thinking', { seconds: 2 });
  });

  it('keeps conversation cookie stable across reload and rotates on clear', async () => {
    const firstPage = await request(httpApp).get('/');
    const firstCookie = firstPage.headers['set-cookie'][0];
    const firstConversationId = firstCookie.match(
      new RegExp(`${GATEWAY_WEB_CONVERSATION_COOKIE}=([^;]+)`),
    )?.[1] as string;

    const secondPage = await request(httpApp)
      .get('/')
      .set('Cookie', firstCookie);
    const secondCookie = secondPage.headers['set-cookie'][0];
    const secondConversationId = secondCookie.match(
      new RegExp(`${GATEWAY_WEB_CONVERSATION_COOKIE}=([^;]+)`),
    )?.[1] as string;

    expect(secondConversationId).toBe(firstConversationId);

    const clearResponse = await request(httpApp)
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
