import { ConfigService } from '@nestjs/config';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssistantWorkerMetricsService } from '../observability/assistant-worker-metrics.service';
import { FileQueueConsumerService } from '../queue/file-queue-consumer.service';
import { AssistantWorkerConversationService } from './assistant-worker-conversation.service';
import type { AssistantLlmProvider } from './assistant-llm-provider';
import { AssistantWorkerProcessorService } from './assistant-worker-processor.service';
import { CallbackDeliveryService } from './callback-delivery.service';

describe('AssistantWorkerProcessorService', () => {
  it('reads a file queue message and sends a callback', async () => {
    const queueDir = await mkdtemp(join(tmpdir(), 'assistant-worker-queue-'));
    await writeFile(
      join(queueDir, '001.json'),
      JSON.stringify({
        chat: 'direct',
        conversation_id: 'alex',
        contact: 'alex',
        direction: 'api',
        host: 'http://example.test',
        message: 'hello',
      }),
      'utf8',
    );

    const callbackDeliveryService = {
      sendResponse: jest.fn().mockResolvedValue(undefined),
      sendThinking: jest.fn().mockResolvedValue(undefined),
    } as unknown as CallbackDeliveryService;
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
    const llmProvider = {
      generateReply: jest.fn().mockResolvedValue({
        context: 'Greeting completed.',
        message: 'hello from grok',
      }),
    } as unknown as AssistantLlmProvider;
    const configService = new ConfigService({
      FILE_QUEUE_DIR: queueDir,
      WORKER_POLL_INTERVAL_MS: '1000',
    });
    const metricsService = new AssistantWorkerMetricsService();
    const fileQueueConsumerService = new FileQueueConsumerService(configService);
    const service = new AssistantWorkerProcessorService(
      {
        read: jest.fn().mockResolvedValue({
          memory_window: 3,
          model: 'grok-4',
          provider: 'xai',
          thinking_interval_seconds: 2,
        }),
      } as never,
      conversationService,
      callbackDeliveryService,
      configService,
      metricsService,
      llmProvider,
      fileQueueConsumerService,
    );

    await service.processOnce();

    expect(callbackDeliveryService.sendResponse).toHaveBeenCalledWith(
      'http://example.test',
      'alex',
      'hello from grok',
    );
    expect(conversationService.appendExchange).toHaveBeenCalledWith(
      expect.objectContaining({
        contact: 'alex',
      }),
      {
        context: 'Greeting completed.',
        message: 'hello from grok',
      },
    );
    expect(await fileQueueConsumerService.depth()).toBe(0);
  });
});
