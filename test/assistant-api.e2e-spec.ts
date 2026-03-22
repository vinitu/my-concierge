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

  it('accepts a conversation and writes it into the file queue', async () => {
    const response = await request(app.getHttpServer())
      .post('/conversation/api/direct/alex')
      .send({
        callback_url: 'http://gateway-web:3000/callbacks/assistant/alex',
        message: 'Turn on the kitchen lights',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      response: 'Message accepted',
    });

    const files = await readdir(queueDir);
    expect(files).toHaveLength(1);
  });

  it('rejects a request without message', async () => {
    const response = await request(app.getHttpServer())
      .post('/conversation/api/direct/alex')
      .send({
        callback_url: 'http://gateway-web:3000/callbacks/assistant/alex',
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
    });
  });

  it('returns metrics including queue depth', async () => {
    const response = await request(app.getHttpServer()).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.text).toContain('assistant_api_queue_messages');
    expect(response.text).toContain('assistant_api_conversations_accepted_total');
  });

  it('returns the assistant-api OpenAPI schema', async () => {
    const response = await request(app.getHttpServer()).get('/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body.info.title).toBe('assistant-api');
  });
});
