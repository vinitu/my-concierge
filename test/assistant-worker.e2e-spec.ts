import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import {
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AssistantWorkerAppModule } from '../src/assistant-worker-app/assistant-worker-app.module';
import { ASSISTANT_LLM_PROVIDER } from '../src/assistant-worker-app/worker/assistant-llm-provider';
import { AssistantLlmProviderStatusService } from '../src/assistant-worker-app/worker/assistant-llm-provider-status.service';

describe('assistant-worker (e2e)', () => {
  let app: NestExpressApplication;
  let callbackMessages: string[] = [];
  let callbackServer: ReturnType<typeof createServer>;
  let callbackUrl = '';
  let datadir: string;
  const llmProvider = {
    generateReply: jest.fn().mockResolvedValue({
      context: 'Greeting completed.',
      message: 'hello from grok',
    }),
  };
  const providerStatus = {
    getStatus: jest.fn().mockResolvedValue({
      apiKeyConfigured: false,
      message: 'XAI_API_KEY is not configured',
      model: 'grok-4',
      provider: 'xai',
      reachable: false,
      status: 'missing_key',
    }),
  };
  let queueDir: string;

  beforeAll(async () => {
    queueDir = await mkdtemp(join(tmpdir(), 'assistant-worker-queue-'));
    datadir = await mkdtemp(join(tmpdir(), 'assistant-worker-runtime-'));

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
      .overrideProvider(ASSISTANT_LLM_PROVIDER)
      .useValue(llmProvider)
      .overrideProvider(AssistantLlmProviderStatusService)
      .useValue(providerStatus)
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          ASSISTANT_DATADIR: datadir,
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
    jest.clearAllMocks();
  });

  it('returns the service root endpoint', async () => {
    const response = await request(app.getHttpServer()).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('assistant-worker');
    expect(response.text).toContain('runtime/assistant-worker/config/worker.json');
    expect(response.text).toContain('<option value="deepseek">deepseek</option>');
    expect(response.text).toContain('<option value="xai" selected>');
    expect(response.text).toContain('<option value="ollama">ollama</option>');
    expect(response.text).toContain('value="3"');
    expect(response.text).toContain('Credential: <span id="provider-credential">missing</span>');
    expect(response.text).toContain('Reachability: <span id="provider-reachable">not working</span>');
  });

  it('returns worker config and stores updates in runtime/assistant-worker/config/worker.json', async () => {
    const getResponse = await request(app.getHttpServer()).get('/config');

    expect(getResponse.status).toBe(200);
    expect(getResponse.body).toEqual({
      model: 'grok-4',
      memory_window: 3,
      provider: 'xai',
    });

    const putResponse = await request(app.getHttpServer()).put('/config').send({
      model: 'deepseek-chat',
      memory_window: 5,
      provider: 'deepseek',
    });

    expect(putResponse.status).toBe(200);
    expect(putResponse.body).toEqual({
      model: 'deepseek-chat',
      memory_window: 5,
      provider: 'deepseek',
    });

    await expect(readFile(join(datadir, 'config', 'worker.json'), 'utf8')).resolves.toContain(
      '"memory_window": 5',
    );
    await expect(readFile(join(datadir, 'config', 'worker.json'), 'utf8')).resolves.toContain(
      '"provider": "deepseek"',
    );
    await expect(readFile(join(datadir, 'config', 'worker.json'), 'utf8')).resolves.toContain(
      '"model": "deepseek-chat"',
    );
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
    expect(callbackMessages[0]).toContain('hello from grok');
    const conversationPath = join(datadir, 'conversations', 'api', 'direct', 'alex.json');
    let storedConversation = '';

    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        storedConversation = await readFile(conversationPath, 'utf8');
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    expect(storedConversation).toContain('"messages"');
    expect(storedConversation).toContain('"context": "Greeting completed."');

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

  it('returns xai provider status', async () => {
    const response = await request(app.getHttpServer()).get('/provider-status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      apiKeyConfigured: false,
      message: 'XAI_API_KEY is not configured',
      model: 'grok-4',
      provider: 'xai',
      reachable: false,
      status: 'missing_key',
    });
  });

  it('returns worker metrics', async () => {
    await writeFile(
      join(queueDir, 'metrics.json'),
      JSON.stringify({
        callback_url: callbackUrl,
        chat: 'direct',
        contact: 'alex',
        direction: 'api',
        message: 'metrics job',
      }),
      'utf8',
    );

    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (callbackMessages.length > 0) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    await request(app.getHttpServer()).get('/status');

    const response = await request(app.getHttpServer()).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.text).toContain('http_request_time_ms');
    expect(response.text).toContain(
      'route="/status",service="assistant-worker",response_code="200"',
    );
    expect(response.text).toContain('processed_jobs_total{service="assistant-worker"}');
    expect(response.text).toContain('callback_requests_total{service="assistant-worker",status=');
  });

  it('returns worker OpenAPI schema', async () => {
    const response = await request(app.getHttpServer()).get('/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body.info.title).toBe('assistant-worker');
    expect(response.body.paths['/']).toBeDefined();
    expect(response.body.paths['/provider-status']).toBeDefined();
  });
});
