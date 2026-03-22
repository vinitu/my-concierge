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
import { MemoryQueueAdapter } from './queue/memory-queue.adapter';
import { RedisQueueAdapter } from './queue/redis-queue.adapter';
import { AssistantApiStatusController } from './status.controller';
import {
  QUEUE_ADAPTER,
  type QueueAdapter,
} from './queue/queue-adapter';

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
    HttpRequestMetricsInterceptor,
    FileQueueAdapter,
    MemoryQueueAdapter,
    RedisQueueAdapter,
    QueueService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpRequestMetricsInterceptor,
    },
    {
      provide: QUEUE_ADAPTER,
      inject: [ConfigService, FileQueueAdapter, MemoryQueueAdapter, RedisQueueAdapter],
      useFactory: (
        configService: ConfigService,
        fileQueueAdapter: FileQueueAdapter,
        memoryQueueAdapter: MemoryQueueAdapter,
        redisQueueAdapter: RedisQueueAdapter,
      ): QueueAdapter => {
        const queueAdapter = configService.get<string>('QUEUE_ADAPTER', 'redis');

        if (queueAdapter === 'memory') {
          return memoryQueueAdapter;
        }

        if (queueAdapter === 'file') {
          return fileQueueAdapter;
        }

        return redisQueueAdapter;
      },
    },
  ],
})
export class AssistantApiAppModule {}
