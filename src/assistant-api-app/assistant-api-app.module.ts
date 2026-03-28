import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConversationController } from './conversation.controller';
import { AssistantApiMetricsController } from './observability/assistant-api-metrics.controller';
import { AssistantApiMetricsService } from './observability/assistant-api-metrics.service';
import { HttpRequestMetricsInterceptor } from './observability/http-request-metrics.interceptor';
import { AssistantApiOpenApiController } from './openapi.controller';
import { AssistantApiRootController } from './root.controller';
import { QueueService } from './queue/queue.service';
import { FileQueueAdapter } from './queue/file-queue.adapter';
import { RedisQueueAdapter } from './queue/redis-queue.adapter';
import { AssistantApiStatusController } from './status.controller';
import {
  QUEUE_ADAPTER,
  type QueueAdapter,
} from './queue/queue-adapter';
import { CallbackDeliveryService } from './run-events/callback-delivery.service';
import { RedisRunEventQueueConsumer } from './run-events/redis-run-event-queue.consumer';
import { RunEventProcessorService } from './run-events/run-event-processor.service';
import {
  RUN_EVENT_QUEUE_CONSUMER,
  type RunEventQueueConsumer,
} from './run-events/run-event-queue';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [
    AssistantApiMetricsController,
    AssistantApiOpenApiController,
    AssistantApiRootController,
    AssistantApiStatusController,
    ConversationController,
  ],
  providers: [
    AssistantApiMetricsService,
    CallbackDeliveryService,
    HttpRequestMetricsInterceptor,
    FileQueueAdapter,
    RedisQueueAdapter,
    RedisRunEventQueueConsumer,
    QueueService,
    RunEventProcessorService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpRequestMetricsInterceptor,
    },
    {
      provide: QUEUE_ADAPTER,
      inject: [ConfigService, FileQueueAdapter, RedisQueueAdapter],
      useFactory: (
        configService: ConfigService,
        fileQueueAdapter: FileQueueAdapter,
        redisQueueAdapter: RedisQueueAdapter,
      ): QueueAdapter => {
        const queueAdapter = configService.get<string>('QUEUE_ADAPTER', 'redis');

        if (queueAdapter === 'file') {
          return fileQueueAdapter;
        }

        return redisQueueAdapter;
      },
    },
    {
      provide: RUN_EVENT_QUEUE_CONSUMER,
      useExisting: RedisRunEventQueueConsumer,
    },
  ],
})
export class AssistantApiAppModule {}
