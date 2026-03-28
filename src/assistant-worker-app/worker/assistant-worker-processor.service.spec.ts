import { ConfigService } from '@nestjs/config';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssistantWorkerMetricsService } from '../observability/assistant-worker-metrics.service';
import { FileQueueConsumerService } from '../queue/file-queue-consumer.service';
import type { RunEventPublisher } from '../run-events/run-event-publisher';
import { AssistantLangchainRuntimeService } from './assistant-langchain-runtime.service';
import { AssistantMemoryClientService } from './assistant-memory-client.service';
import { AssistantWorkerConversationService } from './assistant-worker-conversation.service';
import { AssistantRuntimeError } from './assistant-runtime-error';
import { AssistantWorkerProcessorService } from './assistant-worker-processor.service';

describe('AssistantWorkerProcessorService', () => {
  it('expands effective conversation context when user message references prior decisions', async () => {
    const queueDir = await mkdtemp(join(tmpdir(), 'assistant-worker-queue-'));
    await writeFile(
      join(queueDir, '001.json'),
      JSON.stringify({
        accepted_at: new Date().toISOString(),
        callback: {
          base_url: 'http://example.test',
        },
        chat: 'direct',
        conversation_id: 'alex',
        contact: 'alex',
        direction: 'api',
        message: 'что мы решили?',
        request_id: 'req-expand-1',
      }),
      'utf8',
    );

    const runEventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as unknown as RunEventPublisher;
    const langchainRuntime = {
      run: jest.fn().mockResolvedValue({
        context: 'Summary confirmed.',
        message: 'Ранее мы решили ужин в 19:00.',
        memory_writes: [],
        tool_observations: [],
      }),
    } as unknown as AssistantLangchainRuntimeService;
    const conversationService = {
      appendExchange: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue({
        chat: 'direct',
        contact: 'alex',
        context: '',
        direction: 'api',
        messages: [
          {
            content: 'привет',
            created_at: '2026-03-28T10:00:00.000Z',
            role: 'user',
          },
          {
            content: 'Привет!',
            created_at: '2026-03-28T10:00:01.000Z',
            role: 'assistant',
          },
          {
            content: 'что мы решили?',
            created_at: '2026-03-28T10:00:02.000Z',
            role: 'user',
          },
        ],
        updated_at: null,
      }),
      searchThread: jest.fn().mockResolvedValue({
        messages: [
          {
            content: 'Решили ужин в 19:00.',
            created_at: '2026-03-27T09:00:00.000Z',
            role: 'assistant',
          },
          {
            content: 'Запомнить время ужина.',
            created_at: '2026-03-27T09:01:00.000Z',
            role: 'user',
          },
        ],
        summary: 'Активный контекст: ужин сегодня в 19:00.',
        thread_id: 'alex',
      }),
    } as unknown as AssistantWorkerConversationService;

    const service = new AssistantWorkerProcessorService(
      {
        read: jest.fn().mockResolvedValue({
          deepseek_api_key: '',
          deepseek_base_url: 'https://api.deepseek.com',
          deepseek_timeout_ms: 360000,
          memory_window: 3,
          model: 'grok-4',
          ollama_base_url: 'http://host.docker.internal:11434',
          ollama_timeout_ms: 360000,
          provider: 'xai',
          run_timeout_seconds: 30,
          thinking_interval_seconds: 2,
          xai_api_key: '',
          xai_base_url: 'https://api.x.ai/v1',
          xai_timeout_ms: 360000,
        }),
      } as never,
      langchainRuntime,
      {
        getStatus: jest.fn().mockResolvedValue({
          apiKeyConfigured: true,
          message: 'xAI API is reachable',
          model: 'grok-4',
          provider: 'xai',
          reachable: true,
          status: 'ready',
        }),
      } as never,
      {
        safeSearch: jest.fn().mockResolvedValue({ count: 0, entries: [] }),
        safeWrite: jest.fn().mockResolvedValue(undefined),
      } as unknown as AssistantMemoryClientService,
      conversationService,
      new ConfigService({
        FILE_QUEUE_DIR: queueDir,
        WORKER_POLL_INTERVAL_MS: '1000',
      }),
      new AssistantWorkerMetricsService(),
      new FileQueueConsumerService(
        new ConfigService({
          FILE_QUEUE_DIR: queueDir,
        }),
      ),
      runEventPublisher,
    );

    await service.processOnce();

    expect(conversationService.searchThread).toHaveBeenCalledWith('alex', 12);
    expect(langchainRuntime.run).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation: expect.objectContaining({
          context: 'Активный контекст: ужин сегодня в 19:00.',
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: 'Решили ужин в 19:00.',
            }),
            expect.objectContaining({
              content: 'что мы решили?',
            }),
          ]),
        }),
      }),
      undefined,
    );
  });

  it('reads a file queue message and publishes run events', async () => {
    const queueDir = await mkdtemp(join(tmpdir(), 'assistant-worker-queue-'));
    await writeFile(
      join(queueDir, '001.json'),
      JSON.stringify({
        accepted_at: new Date().toISOString(),
        callback: {
          base_url: 'http://example.test',
        },
        chat: 'direct',
        conversation_id: 'alex',
        contact: 'alex',
        direction: 'api',
        message: 'hello',
        request_id: 'req-1',
      }),
      'utf8',
    );

    const runEventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as unknown as RunEventPublisher;
    const conversationService = {
      appendExchange: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue({
        chat: 'direct',
        contact: 'alex',
        context: '',
        direction: 'api',
        messages: [],
        updated_at: null,
      }),
    } as unknown as AssistantWorkerConversationService;
    const assistantMemoryClientService = {
      safeSearch: jest.fn().mockResolvedValue({
        count: 1,
        entries: [
          {
            archivedAt: null,
            confidence: 0.91,
            content: 'Alex prefers short answers.',
            conversationThreadId: 'alex',
            createdAt: '2026-03-27T09:00:00.000Z',
            id: 'mem_1',
            kind: 'preference',
            lastAccessedAt: null,
            scope: 'conversation',
            source: 'assistant-worker',
            tags: ['api'],
            updatedAt: '2026-03-27T09:00:00.000Z',
          },
        ],
      }),
      safeWrite: jest.fn().mockResolvedValue(undefined),
    } as unknown as AssistantMemoryClientService;
    const langchainRuntime = {
      run: jest.fn().mockResolvedValue({
        context: 'Greeting completed.',
        message: 'hello from grok',
        memory_writes: [],
        tool_observations: [],
      }),
    } as unknown as AssistantLangchainRuntimeService;
    const configService = new ConfigService({
      FILE_QUEUE_DIR: queueDir,
      WORKER_POLL_INTERVAL_MS: '1000',
    });
    const metricsService = new AssistantWorkerMetricsService();
    const fileQueueConsumerService = new FileQueueConsumerService(configService);
    const service = new AssistantWorkerProcessorService(
      {
        read: jest.fn().mockResolvedValue({
          deepseek_api_key: '',
          deepseek_base_url: 'https://api.deepseek.com',
          deepseek_timeout_ms: 360000,
          memory_window: 3,
          model: 'grok-4',
          ollama_base_url: 'http://host.docker.internal:11434',
          ollama_timeout_ms: 360000,
          provider: 'xai',
          run_timeout_seconds: 30,
          thinking_interval_seconds: 2,
          xai_api_key: '',
          xai_base_url: 'https://api.x.ai/v1',
          xai_timeout_ms: 360000,
        }),
      } as never,
      langchainRuntime,
      {
        getStatus: jest.fn().mockResolvedValue({
          apiKeyConfigured: true,
          message: 'xAI API is reachable',
          model: 'grok-4',
          provider: 'xai',
          reachable: true,
          status: 'ready',
        }),
      } as never,
      assistantMemoryClientService,
      conversationService,
      configService,
      metricsService,
      fileQueueConsumerService,
      runEventPublisher,
    );

    await service.processOnce();

    expect(assistantMemoryClientService.safeSearch).toHaveBeenCalledWith('hello', 'alex');
    expect(assistantMemoryClientService.safeWrite).toHaveBeenCalledWith([]);
    expect(langchainRuntime.run).toHaveBeenCalledWith(
      expect.objectContaining({
        retrieved_memory: expect.arrayContaining([
          expect.objectContaining({
            content: 'Alex prefers short answers.',
          }),
        ]),
      }),
      undefined,
    );
    expect(runEventPublisher.publish).toHaveBeenCalledTimes(2);
    expect(conversationService.appendExchange).toHaveBeenCalledWith(
      expect.objectContaining({
        contact: 'alex',
      }),
      expect.objectContaining({
        context: 'Greeting completed.',
        memory_writes: [],
        message: 'hello from grok',
        tool_observations: [],
      }),
      expect.any(String),
    );
    expect(await fileQueueConsumerService.depth()).toBe(0);
  });

  it('stores meaningful conversation context in durable memory', async () => {
    const queueDir = await mkdtemp(join(tmpdir(), 'assistant-worker-queue-'));
    await writeFile(
      join(queueDir, '001.json'),
      JSON.stringify({
        accepted_at: new Date().toISOString(),
        callback: {
          base_url: 'http://example.test',
        },
        chat: 'direct',
        conversation_id: 'alex',
        contact: 'alex',
        direction: 'api',
        message: 'remember this',
        request_id: 'req-meaningful',
      }),
      'utf8',
    );

    const runEventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as unknown as RunEventPublisher;
    const assistantMemoryClientService = {
      safeSearch: jest.fn().mockResolvedValue({ count: 0, entries: [] }),
      safeWrite: jest.fn().mockResolvedValue(undefined),
    } as unknown as AssistantMemoryClientService;
    const service = new AssistantWorkerProcessorService(
      {
        read: jest.fn().mockResolvedValue({
          deepseek_api_key: '',
          deepseek_base_url: 'https://api.deepseek.com',
          deepseek_timeout_ms: 360000,
          memory_window: 3,
          model: 'grok-4',
          ollama_base_url: 'http://host.docker.internal:11434',
          ollama_timeout_ms: 360000,
          provider: 'xai',
          run_timeout_seconds: 30,
          thinking_interval_seconds: 2,
          xai_api_key: '',
          xai_base_url: 'https://api.x.ai/v1',
          xai_timeout_ms: 360000,
        }),
      } as never,
      {
        run: jest.fn().mockResolvedValue({
          context: 'The user wants concise Russian greetings and quick status updates.',
          message: 'Запомнила.',
          memory_writes: [],
          tool_observations: [],
        }),
      } as unknown as AssistantLangchainRuntimeService,
      {
        getStatus: jest.fn().mockResolvedValue({
          apiKeyConfigured: true,
          message: 'xAI API is reachable',
          model: 'grok-4',
          provider: 'xai',
          reachable: true,
          status: 'ready',
        }),
      } as never,
      assistantMemoryClientService,
      {
        appendExchange: jest.fn().mockResolvedValue(undefined),
        read: jest.fn().mockResolvedValue({
          chat: 'direct',
          contact: 'alex',
          context: '',
          direction: 'api',
          messages: [],
          updated_at: null,
        }),
      } as unknown as AssistantWorkerConversationService,
      new ConfigService({
        FILE_QUEUE_DIR: queueDir,
        WORKER_POLL_INTERVAL_MS: '1000',
      }),
      new AssistantWorkerMetricsService(),
      new FileQueueConsumerService(
        new ConfigService({
          FILE_QUEUE_DIR: queueDir,
        }),
      ),
      runEventPublisher,
    );

    await service.processOnce();

    expect(assistantMemoryClientService.safeWrite).toHaveBeenCalledWith([
      {
        confidence: 0.75,
        content: 'The user wants concise Russian greetings and quick status updates.',
        conversationThreadId: 'alex',
        kind: 'episode',
        scope: 'conversation',
        source: 'assistant-worker',
        tags: ['api', 'direct'],
      },
    ]);
  });

  it('publishes a descriptive run.failed event when provider settings are missing', async () => {
    const queueDir = await mkdtemp(join(tmpdir(), 'assistant-worker-queue-'));
    await writeFile(
      join(queueDir, '001.json'),
      JSON.stringify({
        accepted_at: new Date().toISOString(),
        callback: {
          base_url: 'http://example.test',
        },
        chat: 'direct',
        conversation_id: 'alex',
        contact: 'alex',
        direction: 'api',
        message: 'hello',
        request_id: 'req-1',
      }),
      'utf8',
    );

    const runEventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as unknown as RunEventPublisher;
    const service = new AssistantWorkerProcessorService(
      {
        read: jest.fn().mockResolvedValue({
          deepseek_api_key: '',
          deepseek_base_url: 'https://api.deepseek.com',
          deepseek_timeout_ms: 360000,
          memory_window: 3,
          model: 'grok-4',
          ollama_base_url: 'http://host.docker.internal:11434',
          ollama_timeout_ms: 360000,
          provider: 'xai',
          run_timeout_seconds: 30,
          thinking_interval_seconds: 2,
          xai_api_key: '',
          xai_base_url: 'https://api.x.ai/v1',
          xai_timeout_ms: 360000,
        }),
      } as never,
      {
        run: jest.fn().mockRejectedValue(
          new AssistantRuntimeError(
            'PROVIDER_ERROR',
            'LangChain runtime failed',
            new Error('xAI API key is not configured in assistant-worker web settings'),
          ),
        ),
      } as unknown as AssistantLangchainRuntimeService,
      {
        getStatus: jest.fn().mockResolvedValue({
          apiKeyConfigured: true,
          message: 'xAI API is reachable',
          model: 'grok-4',
          provider: 'xai',
          reachable: true,
          status: 'ready',
        }),
      } as never,
      {
        safeSearch: jest.fn().mockResolvedValue({ count: 0, entries: [] }),
        safeWrite: jest.fn().mockResolvedValue(undefined),
      } as unknown as AssistantMemoryClientService,
      {
        appendExchange: jest.fn().mockResolvedValue(undefined),
        read: jest.fn().mockResolvedValue({
          chat: 'direct',
          contact: 'alex',
          context: '',
          direction: 'api',
          messages: [],
          updated_at: null,
        }),
      } as unknown as AssistantWorkerConversationService,
      new ConfigService({
        FILE_QUEUE_DIR: queueDir,
        WORKER_POLL_INTERVAL_MS: '1000',
      }),
      new AssistantWorkerMetricsService(),
      new FileQueueConsumerService(
        new ConfigService({
          FILE_QUEUE_DIR: queueDir,
        }),
      ),
      runEventPublisher,
    );

    await service.processOnce();

    expect(runEventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'run.failed',
        payload: expect.objectContaining({
          code: 'PROVIDER_ERROR',
          message:
            'assistant-worker is not configured: xAI API key is missing. Open the assistant-worker web panel and save the AI settings.',
        }),
      }),
    );
  });

  it('publishes run.failed immediately when conversation state cannot be loaded', async () => {
    const queueDir = await mkdtemp(join(tmpdir(), 'assistant-worker-queue-'));
    await writeFile(
      join(queueDir, '001.json'),
      JSON.stringify({
        accepted_at: new Date().toISOString(),
        callback: {
          base_url: 'http://example.test',
        },
        chat: 'direct',
        conversation_id: 'alex',
        contact: 'alex',
        direction: 'api',
        message: 'hello',
        request_id: 'req-2',
      }),
      'utf8',
    );

    const runEventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as unknown as RunEventPublisher;
    const langchainRuntime = {
      run: jest.fn(),
    } as unknown as AssistantLangchainRuntimeService;
    const service = new AssistantWorkerProcessorService(
      {
        read: jest.fn().mockResolvedValue({
          deepseek_api_key: 'key',
          deepseek_base_url: 'https://api.deepseek.com',
          deepseek_timeout_ms: 30000,
          memory_window: 3,
          model: 'deepseek-chat',
          ollama_base_url: 'http://host.docker.internal:11434',
          ollama_timeout_ms: 360000,
          provider: 'deepseek',
          run_timeout_seconds: 30,
          thinking_interval_seconds: 2,
          xai_api_key: '',
          xai_base_url: 'https://api.x.ai/v1',
          xai_timeout_ms: 360000,
        }),
      } as never,
      langchainRuntime,
      {
        getStatus: jest.fn().mockResolvedValue({
          apiKeyConfigured: true,
          message: 'DeepSeek API is reachable',
          model: 'deepseek-chat',
          provider: 'deepseek',
          reachable: true,
          status: 'ready',
        }),
      } as never,
      {
        safeSearch: jest.fn(),
        safeWrite: jest.fn(),
      } as unknown as AssistantMemoryClientService,
      {
        appendExchange: jest.fn(),
        read: jest.fn().mockRejectedValue(
          new Error('Missing MySQL schema table: conversation_threads. Run npm run db:migrate first.'),
        ),
      } as unknown as AssistantWorkerConversationService,
      new ConfigService({
        FILE_QUEUE_DIR: queueDir,
        WORKER_POLL_INTERVAL_MS: '1000',
      }),
      new AssistantWorkerMetricsService(),
      new FileQueueConsumerService(
        new ConfigService({
          FILE_QUEUE_DIR: queueDir,
        }),
      ),
      runEventPublisher,
    );

    await service.processOnce();

    expect(langchainRuntime.run).not.toHaveBeenCalled();
    expect(runEventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'run.failed',
        payload: expect.objectContaining({
          code: 'PERSISTENCE_ERROR',
          message: expect.stringContaining('MySQL conversation storage is not ready'),
        }),
      }),
    );
  });

  it('publishes a human-readable run.failed event when the model selects a disabled tool', async () => {
    const queueDir = await mkdtemp(join(tmpdir(), 'assistant-worker-queue-'));
    await writeFile(
      join(queueDir, '001.json'),
      JSON.stringify({
        accepted_at: new Date().toISOString(),
        callback: {
          base_url: 'http://example.test',
        },
        chat: 'direct',
        conversation_id: 'alex',
        contact: 'alex',
        direction: 'api',
        message: 'hello',
        request_id: 'req-3',
      }),
      'utf8',
    );

    const runEventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as unknown as RunEventPublisher;
    const service = new AssistantWorkerProcessorService(
      {
        read: jest.fn().mockResolvedValue({
          deepseek_api_key: 'key',
          deepseek_base_url: 'https://api.deepseek.com',
          deepseek_timeout_ms: 30000,
          enabled_tools: ['memory_search_federated'],
          memory_window: 3,
          model: 'deepseek-chat',
          ollama_base_url: 'http://host.docker.internal:11434',
          ollama_timeout_ms: 360000,
          provider: 'deepseek',
          run_timeout_seconds: 30,
          thinking_interval_seconds: 2,
          xai_api_key: '',
          xai_base_url: 'https://api.x.ai/v1',
          xai_timeout_ms: 360000,
        }),
      } as never,
      {
        run: jest.fn().mockRejectedValue(
          new AssistantRuntimeError(
            'TOOL_ERROR',
            'Tool is disabled in assistant-worker settings: time_current',
          ),
        ),
      } as unknown as AssistantLangchainRuntimeService,
      {
        getStatus: jest.fn().mockResolvedValue({
          apiKeyConfigured: true,
          message: 'DeepSeek API is reachable',
          model: 'deepseek-chat',
          provider: 'deepseek',
          reachable: true,
          status: 'ready',
        }),
      } as never,
      {
        safeSearch: jest.fn().mockResolvedValue({ count: 0, entries: [] }),
        safeWrite: jest.fn().mockResolvedValue(undefined),
      } as unknown as AssistantMemoryClientService,
      {
        appendExchange: jest.fn().mockResolvedValue(undefined),
        read: jest.fn().mockResolvedValue({
          chat: 'direct',
          contact: 'alex',
          context: '',
          direction: 'api',
          messages: [],
          updated_at: null,
        }),
      } as unknown as AssistantWorkerConversationService,
      new ConfigService({
        FILE_QUEUE_DIR: queueDir,
        WORKER_POLL_INTERVAL_MS: '1000',
      }),
      new AssistantWorkerMetricsService(),
      new FileQueueConsumerService(
        new ConfigService({
          FILE_QUEUE_DIR: queueDir,
        }),
      ),
      runEventPublisher,
    );

    await service.processOnce();

    expect(runEventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'run.failed',
        payload: expect.objectContaining({
          code: 'TOOL_ERROR',
          message:
            'assistant-worker tried to use a disabled tool: time_current. Enable it in the Tools section or keep only the tools you want the model to use.',
        }),
      }),
    );
  });
});
