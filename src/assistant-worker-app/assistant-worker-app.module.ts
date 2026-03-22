import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AssistantWorkerMetricsController } from './observability/assistant-worker-metrics.controller';
import { AssistantWorkerMetricsService } from './observability/assistant-worker-metrics.service';
import { HttpRequestMetricsInterceptor } from './observability/http-request-metrics.interceptor';
import { AssistantWorkerOpenApiController } from './openapi.controller';
import { FileQueueConsumerService } from './queue/file-queue-consumer.service';
import { RedisQueueConsumerService } from './queue/redis-queue-consumer.service';
import {
  WORKER_QUEUE_CONSUMER,
  type QueueConsumer,
} from './queue/queue-consumer';
import { AssistantWorkerProcessorService } from './worker/assistant-worker-processor.service';
import { CallbackDeliveryService } from './worker/callback-delivery.service';
import { AssistantWorkerRootController } from './root.controller';
import { AssistantWorkerStatusController } from './status.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [
    AssistantWorkerMetricsController,
    AssistantWorkerOpenApiController,
    AssistantWorkerRootController,
    AssistantWorkerStatusController,
  ],
  providers: [
    AssistantWorkerMetricsService,
    HttpRequestMetricsInterceptor,
    AssistantWorkerProcessorService,
    CallbackDeliveryService,
    FileQueueConsumerService,
    RedisQueueConsumerService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpRequestMetricsInterceptor,
    },
    {
      provide: WORKER_QUEUE_CONSUMER,
      inject: [ConfigService, FileQueueConsumerService, RedisQueueConsumerService],
      useFactory: (
        configService: ConfigService,
        fileQueueConsumerService: FileQueueConsumerService,
        redisQueueConsumerService: RedisQueueConsumerService,
      ): QueueConsumer => {
        const queueAdapter = configService.get<string>('QUEUE_ADAPTER', 'redis');

        if (queueAdapter === 'file') {
          return fileQueueConsumerService;
        }

        return redisQueueConsumerService;
      },
    },
  ],
})
export class AssistantWorkerAppModule {}
