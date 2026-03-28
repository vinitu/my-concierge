import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import {
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AssistantWorkerAppModule } from '../src/assistant-worker-app/assistant-worker-app.module';
import { RUN_EVENT_PUBLISHER } from '../src/assistant-worker-app/run-events/run-event-publisher';
import { AssistantLangchainRuntimeService } from '../src/assistant-worker-app/worker/assistant-langchain-runtime.service';
import { AssistantLlmProviderStatusService } from '../src/assistant-worker-app/worker/assistant-llm-provider-status.service';
import { OllamaProviderStatusService } from '../src/assistant-worker-app/worker/ollama-provider-status.service';

describe('assistant-worker (e2e)', () => {
  let app: NestExpressApplication;
  let completedEvents: Array<Record<string, unknown>> = [];
  let failedEvents: Array<Record<string, unknown>> = [];
  let thinkingEvents: Array<Record<string, unknown>> = [];
  let datadir: string;
  const langchainRuntime = {
    run: jest.fn().mockResolvedValue({
      context: 'Greeting completed.',
      message: 'hello from grok',
      memory_writes: [],
      tool_observations: [],
    }),
  };
  const providerStatus = {
    getStatus: jest.fn(),
  };
  const ollamaProviderStatus = {
    listAvailableModels: jest.fn(),
  };
  let queueDir: string;
  const runEventPublisher = {
    driverName: jest.fn().mockReturnValue('memory'),
    publish: jest.fn().mockImplementation(async (event) => {
      if (event.eventType === 'run.thinking') {
        thinkingEvents.push(event as Record<string, unknown>);
      } else if (event.eventType === 'run.completed') {
        completedEvents.push(event as Record<string, unknown>);
      } else if (event.eventType === 'run.failed') {
        failedEvents.push(event as Record<string, unknown>);
      }

      return event;
    }),
  };

  beforeAll(async () => {
    queueDir = await mkdtemp(join(tmpdir(), 'assistant-worker-queue-'));
    datadir = await mkdtemp(join(tmpdir(), 'assistant-worker-runtime-'));

    const moduleRef = await Test.createTestingModule({
      imports: [AssistantWorkerAppModule],
    })
      .overrideProvider(AssistantLangchainRuntimeService)
      .useValue(langchainRuntime)
      .overrideProvider(RUN_EVENT_PUBLISHER)
      .useValue(runEventPublisher)
      .overrideProvider(AssistantLlmProviderStatusService)
      .useValue(providerStatus)
      .overrideProvider(OllamaProviderStatusService)
      .useValue(ollamaProviderStatus)
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          ASSISTANT_DATADIR: datadir,
          ASSISTANT_CONVERSATION_STORE_DRIVER: 'file',
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
  });

  beforeEach(() => {
    completedEvents = [];
    failedEvents = [];
    thinkingEvents = [];
    jest.clearAllMocks();
    providerStatus.getStatus.mockResolvedValue({
      apiKeyConfigured: true,
      message: 'xAI API is reachable',
      model: 'grok-4',
      provider: 'xai',
      reachable: true,
      status: 'ready',
    });
    ollamaProviderStatus.listAvailableModels.mockResolvedValue([
      'llama3.2:3b',
      'qwen2.5:7b',
    ]);
  });

  it('returns the service root endpoint', async () => {
    const response = await request(app.getHttpServer()).get('/');

    expect(response.status).toBe(200);
    expect(response.text).toContain('assistant-worker');
    expect(response.text).toContain('runtime/assistant-worker/config/worker.json');
    expect(response.text).toContain('Integrations');
    expect(response.text).toContain('>Brave<');
    expect(response.text).toContain('<option value="deepseek">deepseek</option>');
    expect(response.text).toContain('<option value="xai" selected>');
    expect(response.text).toContain('<option value="ollama">ollama</option>');
    expect(response.text).toContain('value="3"');
    expect(response.text).toContain('value="2"');
    expect(response.text).toContain('name="run_timeout_seconds"');
    expect(response.text).toContain('name="enabled_tools"');
    expect(response.text).toContain('value="web_search" checked');
    expect(response.text).toContain('value="memory_search_federated" checked');
    expect(response.text).toContain('name="brave_api_key"');
    expect(response.text).toContain('name="brave_base_url"');
    expect(response.text).toContain('name="brave_timeout_ms"');
    expect(response.text).toContain('name="xai_api_key"');
    expect(response.text).toContain('name="deepseek_api_key"');
    expect(response.text).toContain('name="ollama_base_url"');
    expect(response.text).toContain('Available local models');
    expect(response.text).toContain('llama3.2:3b, qwen2.5:7b');
    expect(response.text).toContain('Credential: <span id="provider-credential">configured</span>');
    expect(response.text).toContain('Reachability: <span id="provider-reachable">working</span>');
  });

  it('returns worker config and stores updates in runtime/assistant-worker/config/worker.json', async () => {
    const getResponse = await request(app.getHttpServer()).get('/config');

    expect(getResponse.status).toBe(200);
    expect(getResponse.body).toEqual({
      brave_api_key: '',
      brave_base_url: 'https://api.search.brave.com',
      brave_timeout_ms: 30000,
      deepseek_api_key: '',
      deepseek_base_url: 'https://api.deepseek.com',
      deepseek_timeout_ms: 360000,
      enabled_tools: [
        'time_current',
        'web_search',
        'memory_search_federated',
        'memory_search_preference',
        'memory_search_fact',
        'memory_search_routine',
        'memory_search_project',
        'memory_search_episode',
        'memory_search_rule',
        'memory_write_preference',
        'memory_write_fact',
        'memory_write_routine',
        'memory_write_project',
        'memory_write_episode',
        'memory_write_rule',
        'conversation_search',
        'skill_execute',
      ],
      model: 'grok-4',
      memory_window: 3,
      ollama_base_url: 'http://host.docker.internal:11434',
      ollama_timeout_ms: 360000,
      provider: 'xai',
      run_timeout_seconds: 30,
      thinking_interval_seconds: 2,
      xai_api_key: '',
      xai_base_url: 'https://api.x.ai/v1',
      xai_timeout_ms: 360000,
    });

    const putResponse = await request(app.getHttpServer()).put('/config').send({
      brave_api_key: 'brave-key',
      brave_base_url: 'https://brave.example.test',
      brave_timeout_ms: 20000,
      deepseek_api_key: 'deepseek-key',
      deepseek_base_url: 'https://deepseek.example.test',
      deepseek_timeout_ms: 240000,
      enabled_tools: ['time_current', 'memory_search_federated'],
      model: 'deepseek-chat',
      memory_window: 5,
      ollama_base_url: 'http://ollama.example.test:11434',
      ollama_timeout_ms: 150000,
      provider: 'deepseek',
      run_timeout_seconds: 25,
      thinking_interval_seconds: 4,
      xai_api_key: 'xai-key',
      xai_base_url: 'https://xai.example.test/v1',
      xai_timeout_ms: 120000,
    });

    expect(putResponse.status).toBe(200);
    expect(putResponse.body).toEqual({
      brave_api_key: 'brave-key',
      brave_base_url: 'https://brave.example.test',
      brave_timeout_ms: 20000,
      deepseek_api_key: 'deepseek-key',
      deepseek_base_url: 'https://deepseek.example.test',
      deepseek_timeout_ms: 240000,
      enabled_tools: ['time_current', 'memory_search_federated'],
      model: 'deepseek-chat',
      memory_window: 5,
      ollama_base_url: 'http://ollama.example.test:11434',
      ollama_timeout_ms: 150000,
      provider: 'deepseek',
      run_timeout_seconds: 25,
      thinking_interval_seconds: 4,
      xai_api_key: 'xai-key',
      xai_base_url: 'https://xai.example.test/v1',
      xai_timeout_ms: 120000,
    });

    await expect(readFile(join(datadir, 'config', 'worker.json'), 'utf8')).resolves.toContain(
      '"brave_api_key": "brave-key"',
    );
    await expect(readFile(join(datadir, 'config', 'worker.json'), 'utf8')).resolves.toContain(
      '"brave_base_url": "https://brave.example.test"',
    );
    await expect(readFile(join(datadir, 'config', 'worker.json'), 'utf8')).resolves.toContain(
      '"memory_window": 5',
    );
    await expect(readFile(join(datadir, 'config', 'worker.json'), 'utf8')).resolves.toContain(
      '"provider": "deepseek"',
    );
    await expect(readFile(join(datadir, 'config', 'worker.json'), 'utf8')).resolves.toContain(
      '"model": "deepseek-chat"',
    );
    await expect(readFile(join(datadir, 'config', 'worker.json'), 'utf8')).resolves.toContain(
      '"thinking_interval_seconds": 4',
    );
    await expect(readFile(join(datadir, 'config', 'worker.json'), 'utf8')).resolves.toContain(
      '"enabled_tools": [',
    );
    await expect(readFile(join(datadir, 'config', 'worker.json'), 'utf8')).resolves.toContain(
      '"xai_api_key": "xai-key"',
    );
    await expect(readFile(join(datadir, 'config', 'worker.json'), 'utf8')).resolves.toContain(
      '"deepseek_api_key": "deepseek-key"',
    );
    await expect(readFile(join(datadir, 'config', 'worker.json'), 'utf8')).resolves.toContain(
      '"run_timeout_seconds": 25',
    );
  });

  it('persists an explicit empty tool selection instead of restoring all tools', async () => {
    const putResponse = await request(app.getHttpServer()).put('/config').send({
      brave_api_key: '',
      brave_base_url: 'https://api.search.brave.com',
      brave_timeout_ms: 30000,
      deepseek_api_key: '',
      deepseek_base_url: 'https://api.deepseek.com',
      deepseek_timeout_ms: 360000,
      enabled_tools: [],
      model: 'grok-4',
      memory_window: 3,
      ollama_base_url: 'http://host.docker.internal:11434',
      ollama_timeout_ms: 360000,
      provider: 'xai',
      run_timeout_seconds: 30,
      thinking_interval_seconds: 2,
      xai_api_key: '',
      xai_base_url: 'https://api.x.ai/v1',
      xai_timeout_ms: 360000,
    });

    expect(putResponse.status).toBe(200);
    expect(putResponse.body.enabled_tools).toEqual([]);
    await expect(readFile(join(datadir, 'config', 'worker.json'), 'utf8')).resolves.toContain(
      '"enabled_tools": []',
    );
  });

  it('processes a queued file and publishes a completed run event', async () => {
    await writeFile(
      join(queueDir, '001.json'),
      JSON.stringify({
        accepted_at: new Date().toISOString(),
        callback: {
          base_url: 'http://gateway-web:3000',
        },
        chat: 'direct',
        conversation_id: 'alex',
        contact: 'alex',
        direction: 'api',
        message: 'Hello worker',
        request_id: 'req-1',
      }),
      'utf8',
    );

    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (completedEvents.length > 0) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(completedEvents).toHaveLength(1);
    expect(thinkingEvents).toHaveLength(0);
    expect(completedEvents[0]?.payload).toEqual({ message: 'hello from grok' });
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
      conversationStore: 'file',
      queueAdapter: 'file',
      ready: true,
      service: 'assistant-worker',
      status: 'ok',
      uptime_seconds: expect.any(Number),
    });
  });

  it('returns xai provider status', async () => {
    providerStatus.getStatus.mockResolvedValueOnce({
      apiKeyConfigured: false,
      message: 'xAI API key is not configured in assistant-worker web settings',
      model: 'grok-4',
      provider: 'xai',
      reachable: false,
      status: 'missing_key',
    });

    const response = await request(app.getHttpServer()).get('/provider-status');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      apiKeyConfigured: false,
      message: 'xAI API key is not configured in assistant-worker web settings',
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
        accepted_at: new Date().toISOString(),
        callback: {
          base_url: 'http://gateway-web:3000',
        },
        chat: 'direct',
        conversation_id: 'alex',
        contact: 'alex',
        direction: 'api',
        message: 'metrics job',
        request_id: 'req-1',
      }),
      'utf8',
    );

    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (completedEvents.length > 0) {
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
    expect(response.text).toContain('run_events_total{event_type=');
  });

  it('sends periodic thinking callbacks while the LLM request is in progress', async () => {
    langchainRuntime.run.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              context: 'Slow request completed.',
              message: 'slow reply',
              memory_writes: [],
              tool_observations: [],
            });
          }, 2600);
        }),
    );

    await writeFile(
      join(datadir, 'config', 'worker.json'),
      `${JSON.stringify(
        {
          deepseek_api_key: '',
          deepseek_base_url: 'https://api.deepseek.com',
          deepseek_timeout_ms: 360000,
          model: 'grok-4',
          memory_window: 3,
          ollama_base_url: 'http://host.docker.internal:11434',
          ollama_timeout_ms: 360000,
          provider: 'xai',
          run_timeout_seconds: 30,
          thinking_interval_seconds: 1,
          xai_api_key: '',
          xai_base_url: 'https://api.x.ai/v1',
          xai_timeout_ms: 360000,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    await writeFile(
      join(queueDir, 'thinking.json'),
      JSON.stringify({
        accepted_at: new Date().toISOString(),
        callback: {
          base_url: 'http://gateway-web:3000',
        },
        chat: 'direct',
        conversation_id: 'alex',
        contact: 'alex',
        direction: 'api',
        message: 'slow job',
        request_id: 'req-1',
      }),
      'utf8',
    );

    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (completedEvents.length > 0) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(completedEvents).toHaveLength(1);
    expect(thinkingEvents.length).toBeGreaterThanOrEqual(2);
    expect(thinkingEvents[0]?.payload).toEqual({ seconds: 1 });
  });

  it('publishes a failed run event and removes the queue file when the runtime fails', async () => {
    langchainRuntime.run.mockRejectedValueOnce(new Error('xAI returned 401 for chat completion'));

    await writeFile(
      join(queueDir, 'failed.json'),
      JSON.stringify({
        accepted_at: new Date().toISOString(),
        callback: {
          base_url: 'http://gateway-web:3000',
        },
        chat: 'direct',
        conversation_id: 'alex',
        contact: 'alex',
        direction: 'api',
        message: 'broken job',
        request_id: 'req-failed',
      }),
      'utf8',
    );

    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (failedEvents.length > 0) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(failedEvents).toHaveLength(1);
    expect(completedEvents).toHaveLength(0);
    expect(failedEvents[0]?.payload).toEqual({
      code: 'RUN_FAILED',
      message: 'assistant-worker could not authenticate with xAI. Check the AI settings in the assistant-worker web panel.',
    });

    let files = await readdir(queueDir);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (files.length === 0) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
      files = await readdir(queueDir);
    }

    expect(files).toEqual(['failed.json.failed']);
  });

  it('returns worker OpenAPI schema', async () => {
    const response = await request(app.getHttpServer()).get('/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body.info.title).toBe('assistant-worker');
    expect(response.body.paths['/']).toBeDefined();
    expect(response.body.paths['/provider-status']).toBeDefined();
  });
});
