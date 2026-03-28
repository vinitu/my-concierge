import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MysqlService } from '../persistence/mysql.service';
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
import { AssistantWorkerConfigService } from './worker/assistant-worker-config.service';
import { AssistantWorkerConversationService } from './worker/assistant-worker-conversation.service';
import { AssistantLangchainRuntimeService } from './worker/assistant-langchain-runtime.service';
import { AssistantMemoryClientService } from './worker/assistant-memory-client.service';
import { AssistantToolDispatcherService } from './worker/assistant-tool-dispatcher.service';
import { AssistantLlmProviderService } from './worker/assistant-llm-provider.service';
import { AssistantLlmProviderStatusService } from './worker/assistant-llm-provider-status.service';
import { AssistantWorkerPromptService } from './worker/assistant-worker-prompt.service';
import { AssistantWorkerPromptTemplateService } from './worker/assistant-worker-prompt-template.service';
import { AssistantWorkerRuntimeContextService } from './worker/assistant-worker-runtime-context.service';
import { AssistantToolCatalogService } from './worker/assistant-tool-catalog.service';
import { ASSISTANT_LLM_PROVIDER } from './worker/assistant-llm-provider';
import { DeepseekChatService } from './worker/deepseek-chat.service';
import { DeepseekProviderStatusService } from './worker/deepseek-provider-status.service';
import { GrokResponsesService } from './worker/grok-responses.service';
import { OllamaChatService } from './worker/ollama-chat.service';
import { OllamaProviderStatusService } from './worker/ollama-provider-status.service';
import { XaiProviderStatusService } from './worker/xai-provider-status.service';
import { AssistantWorkerRootController } from './root.controller';
import { AssistantWorkerStatusController } from './status.controller';
import { RedisRunEventPublisherService } from './run-events/redis-run-event-publisher.service';
import {
  RUN_EVENT_PUBLISHER,
  type RunEventPublisher,
} from './run-events/run-event-publisher';

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
    AssistantMemoryClientService,
    AssistantLangchainRuntimeService,
    AssistantToolDispatcherService,
    MysqlService,
    AssistantWorkerProcessorService,
    AssistantWorkerConfigService,
    AssistantWorkerConversationService,
    AssistantLlmProviderService,
    AssistantLlmProviderStatusService,
    DeepseekChatService,
    DeepseekProviderStatusService,
    AssistantToolCatalogService,
    AssistantWorkerPromptService,
    AssistantWorkerPromptTemplateService,
    AssistantWorkerRuntimeContextService,
    FileQueueConsumerService,
    GrokResponsesService,
    OllamaChatService,
    OllamaProviderStatusService,
    XaiProviderStatusService,
    RedisQueueConsumerService,
    RedisRunEventPublisherService,
    {
      provide: ASSISTANT_LLM_PROVIDER,
      useExisting: AssistantLlmProviderService,
    },
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
    {
      provide: RUN_EVENT_PUBLISHER,
      useExisting: RedisRunEventPublisherService,
    },
  ],
})
export class AssistantWorkerAppModule {}
