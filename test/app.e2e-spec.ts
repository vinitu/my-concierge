import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AssistantApiClientService } from '../src/assistant-api/assistant-api-client.service';
import { AppModule } from '../src/app.module';

describe('gateway-web (e2e)', () => {
  let app: NestExpressApplication;
  let serverUrl: string;
  const assistantApiClientService = {
    sendConversation: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AssistantApiClientService)
      .useValue(assistantApiClientService)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useStaticAssets(`${process.cwd()}/public`);
    await app.listen(0);

    const address = app.getHttpServer().address() as AddressInfo;
    serverUrl = `http://127.0.0.1:${String(address.port)}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the chat page on GET /', async () => {
    const response = await request(app.getHttpServer()).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('MyConcierge');
  });

  it('returns service status', async () => {
    const response = await request(app.getHttpServer()).get('/status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ready: true,
      service: 'gateway-web',
      status: 'ok',
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
    expect(response.body.paths['/callbacks/assistant/{contact}']).toBeDefined();
    expect(response.body.paths['/metrics']).toBeDefined();
    expect(response.body.paths['/status']).toBeDefined();
  });

  it('accepts WebSocket chat messages and forwards them to assistant-api', async () => {
    const client = io(serverUrl, {
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

      setTimeout(() => {
        expect(assistantApiClientService.sendConversation).toHaveBeenCalledWith({
          contact: expect.any(String),
          message: 'hello assistant',
        });
        client.close();
        resolve();
        clearTimeout(timeout);
      }, 100);
    });
  });

  it('delivers callback messages back to the WebSocket session', async () => {
    const client = io(serverUrl, {
      path: '/ws',
      transports: ['websocket'],
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.close();
        reject(new Error('callback timeout'));
      }, 5000);

      client.on('connect', async () => {
        const contact = client.id;
        await request(app.getHttpServer())
          .post(`/callbacks/assistant/${contact}`)
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
});
