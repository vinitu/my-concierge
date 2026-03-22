import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AssistantApiAppModule } from './assistant-api-app.module';
import { QUEUE_ADAPTER } from './queue/queue-adapter';
import { FileQueueAdapter } from './queue/file-queue.adapter';
import { MemoryQueueAdapter } from './queue/memory-queue.adapter';
import { RedisQueueAdapter } from './queue/redis-queue.adapter';

describe('AssistantApiAppModule queue adapter selection', () => {
  it('uses the redis adapter by default', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AssistantApiAppModule],
    }).compile();

    const queueAdapter = moduleRef.get(QUEUE_ADAPTER);

    expect(queueAdapter).toBeInstanceOf(RedisQueueAdapter);
  });

  it('uses the memory adapter when QUEUE_ADAPTER=memory', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AssistantApiAppModule],
    })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          QUEUE_ADAPTER: 'memory',
        }),
      )
      .compile();

    const queueAdapter = moduleRef.get(QUEUE_ADAPTER);

    expect(queueAdapter).toBeInstanceOf(MemoryQueueAdapter);
  });

  it('uses the file adapter when QUEUE_ADAPTER=file', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AssistantApiAppModule],
    })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          QUEUE_ADAPTER: 'file',
        }),
      )
      .compile();

    const queueAdapter = moduleRef.get(QUEUE_ADAPTER);

    expect(queueAdapter).toBeInstanceOf(FileQueueAdapter);
  });
});
