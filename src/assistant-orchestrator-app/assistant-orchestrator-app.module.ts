import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AssistantOrchestratorMetricsController } from './observability/assistant-orchestrator-metrics.controller';
import { AssistantOrchestratorMetricsService } from './observability/assistant-orchestrator-metrics.service';
import { HttpRequestMetricsInterceptor } from './observability/http-request-metrics.interceptor';
import { AssistantOrchestratorOpenApiController } from './openapi.controller';
import { FileQueueConsumerService } from './queue/file-queue-consumer.service';
import { RedisQueueConsumerService } from './queue/redis-queue-consumer.service';
import {
  WORKER_QUEUE_CONSUMER,
  type QueueConsumer,
} from './queue/queue-consumer';
import { AssistantOrchestratorProcessorService } from './worker/assistant-orchestrator-processor.service';
import { AssistantOrchestratorConfigService } from './worker/assistant-orchestrator-config.service';
import { AssistantOrchestratorConversationService } from './worker/assistant-orchestrator-conversation.service';
import { AssistantRuntimeService } from './worker/assistant-runtime.service';
import { AssistantLlmClientService } from './worker/assistant-llm-client.service';
import { AssistantMemoryClientService } from './worker/assistant-memory-client.service';
import { AssistantToolDispatcherService } from './worker/assistant-tool-dispatcher.service';
import { BraveSearchService } from './worker/brave-search.service';
import { AssistantLlmProviderService } from './worker/assistant-llm-provider.service';
import { AssistantLlmProviderStatusService } from './worker/assistant-llm-provider-status.service';
import { AssistantOrchestratorPromptService } from './worker/assistant-orchestrator-prompt.service';
import { AssistantOrchestratorPromptTemplateService } from './worker/assistant-orchestrator-prompt-template.service';
import { AssistantOrchestratorRuntimeContextService } from './worker/assistant-orchestrator-runtime-context.service';
import { AssistantToolCatalogService } from './worker/assistant-tool-catalog.service';
import { ASSISTANT_LLM_PROVIDER } from './worker/assistant-llm-provider';
import { AssistantOrchestratorRootController } from './root.controller';
import { AssistantOrchestratorStatusController } from './status.controller';
import { RedisRunEventPublisherService } from './run-events/redis-run-event-publisher.service';
import {
  RUN_EVENT_PUBLISHER,
  type RunEventPublisher,
} from './run-events/run-event-publisher';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [
    AssistantOrchestratorMetricsController,
    AssistantOrchestratorOpenApiController,
    AssistantOrchestratorRootController,
    AssistantOrchestratorStatusController,
  ],
  providers: [
    AssistantOrchestratorMetricsService,
    HttpRequestMetricsInterceptor,
    AssistantMemoryClientService,
    AssistantLlmClientService,
    BraveSearchService,
    AssistantRuntimeService,
    AssistantToolDispatcherService,
    AssistantOrchestratorProcessorService,
    AssistantOrchestratorConfigService,
    AssistantOrchestratorConversationService,
    AssistantLlmProviderService,
    AssistantLlmProviderStatusService,
    AssistantToolCatalogService,
    AssistantOrchestratorPromptService,
    AssistantOrchestratorPromptTemplateService,
    AssistantOrchestratorRuntimeContextService,
    FileQueueConsumerService,
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
export class AssistantOrchestratorAppModule {}
