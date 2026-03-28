import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AssistantApiAppModule } from '../src/assistant-api-app/assistant-api-app.module';

describe('assistant-api (e2e)', () => {
  let app: NestExpressApplication;
  let queueDir: string;

  beforeAll(async () => {
    queueDir = await mkdtemp(join(tmpdir(), 'assistant-api-queue-'));

    const moduleRef = await Test.createTestingModule({
      imports: [AssistantApiAppModule],
    })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          FILE_QUEUE_DIR: queueDir,
          QUEUE_ADAPTER: 'file',
        }),
      )
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the service root endpoint', async () => {
    const response = await request(app.getHttpServer()).get('/');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      docs: '/openapi.json',
      metrics: '/metrics',
      service: 'assistant-api',
      status: '/status',
    });
  });

  it('accepts a conversation and writes it into the file queue', async () => {
    const response = await request(app.getHttpServer())
      .post('/conversation/api/direct/alex')
      .send({
        callback: {
          base_url: 'http://gateway-web:3000',
        },
        conversation_id: 'alex',
        message: 'Turn on the kitchen lights',
      });

    expect(response.status).toBe(202);
    expect(response.body.status).toBe('accepted');
    expect(typeof response.body.request_id).toBe('string');

    const files = await readdir(queueDir);
    expect(files).toHaveLength(1);
  });

  it('rejects a request without message', async () => {
    const response = await request(app.getHttpServer())
      .post('/conversation/api/direct/alex')
      .send({
        callback: {
          base_url: 'http://gateway-web:3000',
        },
        conversation_id: 'alex',
        message: '   ',
      });

    expect(response.status).toBe(400);
  });

  it('returns status with the selected queue adapter', async () => {
    const response = await request(app.getHttpServer()).get('/status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      queueAdapter: 'file',
      ready: true,
      service: 'assistant-api',
      status: 'ok',
      uptime_seconds: expect.any(Number),
    });
  });

  it('returns metrics including queue depth', async () => {
    await request(app.getHttpServer()).get('/status');

    const response = await request(app.getHttpServer()).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.text).toContain('http_request_time_ms');
    expect(response.text).toContain('route="/status",service="assistant-api",response_code="200"');
    expect(response.text).toContain('queue_messages{service="assistant-api"}');
    expect(response.text).toContain('accepted_messages_total{service="assistant-api"}');
  });

  it('returns the assistant-api OpenAPI schema', async () => {
    const response = await request(app.getHttpServer()).get('/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body.info.title).toBe('assistant-api');
    expect(response.body.paths['/']).toBeDefined();
  });
});
