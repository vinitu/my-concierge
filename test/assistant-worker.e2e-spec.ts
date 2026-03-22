import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import {
  mkdtemp,
  readdir,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AssistantWorkerAppModule } from '../src/assistant-worker-app/assistant-worker-app.module';

describe('assistant-worker (e2e)', () => {
  let app: NestExpressApplication;
  let callbackMessages: string[] = [];
  let callbackServer: ReturnType<typeof createServer>;
  let callbackUrl = '';
  let queueDir: string;

  beforeAll(async () => {
    queueDir = await mkdtemp(join(tmpdir(), 'assistant-worker-queue-'));

    callbackServer = createServer((req, res) => {
      const chunks: Uint8Array[] = [];

      req.on('data', (chunk) => {
        chunks.push(chunk);
      });

      req.on('end', () => {
        callbackMessages.push(Buffer.concat(chunks).toString('utf8'));
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ delivered: true }));
      });
    });

    await new Promise<void>((resolve) => {
      callbackServer.listen(0, '127.0.0.1', resolve);
    });

    const address = callbackServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('callback server address is unavailable');
    }

    callbackUrl = `http://127.0.0.1:${String(address.port)}/callbacks/assistant/alex`;

    const moduleRef = await Test.createTestingModule({
      imports: [AssistantWorkerAppModule],
    })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          FILE_QUEUE_DIR: queueDir,
          QUEUE_ADAPTER: 'file',
          WORKER_POLL_INTERVAL_MS: '50',
        }),
      )
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve, reject) => {
      callbackServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  beforeEach(() => {
    callbackMessages = [];
  });

  it('returns the service root endpoint', async () => {
    const response = await request(app.getHttpServer()).get('/');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      docs: '/openapi.json',
      metrics: '/metrics',
      service: 'assistant-worker',
      status: '/status',
    });
  });

  it('processes a queued file and sends a callback message', async () => {
    await writeFile(
      join(queueDir, '001.json'),
      JSON.stringify({
        callback_url: callbackUrl,
        chat: 'direct',
        contact: 'alex',
        direction: 'api',
        message: 'Hello worker',
      }),
      'utf8',
    );

    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (callbackMessages.length > 0) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(callbackMessages).toHaveLength(1);
    expect(callbackMessages[0]).toContain('I received your message: Hello worker');

    let files = await readdir(queueDir);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (files.length === 0) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
      files = await readdir(queueDir);
    }

    expect(files).toHaveLength(0);
  });

  it('returns worker status', async () => {
    const response = await request(app.getHttpServer()).get('/status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      queueAdapter: 'file',
      ready: true,
      service: 'assistant-worker',
      status: 'ok',
    });
  });

  it('returns worker metrics', async () => {
    const response = await request(app.getHttpServer()).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.text).toContain('assistant_worker_jobs_processed_total');
    expect(response.text).toContain('assistant_worker_callback_requests_total');
  });

  it('returns worker OpenAPI schema', async () => {
    const response = await request(app.getHttpServer()).get('/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body.info.title).toBe('assistant-worker');
    expect(response.body.paths['/']).toBeDefined();
  });
});
