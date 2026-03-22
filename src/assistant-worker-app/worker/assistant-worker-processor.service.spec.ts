import { ConfigService } from '@nestjs/config';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssistantWorkerMetricsService } from '../observability/assistant-worker-metrics.service';
import { FileQueueConsumerService } from '../queue/file-queue-consumer.service';
import { AssistantWorkerProcessorService } from './assistant-worker-processor.service';
import { CallbackDeliveryService } from './callback-delivery.service';
import { GrokResponsesService } from './grok-responses.service';

describe('AssistantWorkerProcessorService', () => {
  it('reads a file queue message and sends a callback', async () => {
    const queueDir = await mkdtemp(join(tmpdir(), 'assistant-worker-queue-'));
    await writeFile(
      join(queueDir, '001.json'),
      JSON.stringify({
        callback_url: 'http://example.test/callback',
        chat: 'direct',
        contact: 'alex',
        direction: 'api',
        message: 'hello',
      }),
      'utf8',
    );

    const callbackDeliveryService = {
      send: jest.fn().mockResolvedValue(undefined),
    } as unknown as CallbackDeliveryService;
    const grokResponsesService = {
      generateReply: jest.fn().mockResolvedValue('hello from grok'),
    } as unknown as GrokResponsesService;
    const configService = new ConfigService({
      FILE_QUEUE_DIR: queueDir,
      WORKER_POLL_INTERVAL_MS: '1000',
    });
    const metricsService = new AssistantWorkerMetricsService();
    const fileQueueConsumerService = new FileQueueConsumerService(configService);
    const service = new AssistantWorkerProcessorService(
      callbackDeliveryService,
      configService,
      grokResponsesService,
      metricsService,
      fileQueueConsumerService,
    );

    await service.processOnce();

    expect(callbackDeliveryService.send).toHaveBeenCalledWith(
      'http://example.test/callback',
      'hello from grok',
    );
    expect(await fileQueueConsumerService.depth()).toBe(0);
  });
});
