import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssistantWorkerMetricsService } from '../observability/assistant-worker-metrics.service';
import {
  type ProcessingQueueMessage,
  WORKER_QUEUE_CONSUMER,
  type QueueConsumer,
} from '../queue/queue-consumer';
import { AssistantWorkerConversationService } from './assistant-worker-conversation.service';
import { CallbackDeliveryService } from './callback-delivery.service';
import {
  type AssistantWorkerConfig,
  AssistantWorkerConfigService,
} from './assistant-worker-config.service';
import {
  ASSISTANT_LLM_PROVIDER,
  type AssistantLlmProvider,
} from './assistant-llm-provider';

@Injectable()
export class AssistantWorkerProcessorService
  implements OnModuleInit, OnModuleDestroy
{
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(
    private readonly assistantWorkerConfigService: AssistantWorkerConfigService,
    private readonly conversationService: AssistantWorkerConversationService,
    private readonly callbackDeliveryService: CallbackDeliveryService,
    private readonly configService: ConfigService,
    private readonly metricsService: AssistantWorkerMetricsService,
    @Inject(ASSISTANT_LLM_PROVIDER)
    private readonly llmProvider: AssistantLlmProvider,
    @Inject(WORKER_QUEUE_CONSUMER)
    private readonly queueConsumer: QueueConsumer,
  ) {}

  onModuleInit(): void {
    const pollIntervalMs = Number.parseInt(
      this.configService.get<string>('WORKER_POLL_INTERVAL_MS', '500'),
      10,
    );

    this.timer = setInterval(() => {
      void this.processOnce();
    }, pollIntervalMs);

    void this.syncQueueDepth();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async processOnce(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;

    try {
      const item = await this.queueConsumer.reserveNext();

      if (!item) {
        await this.syncQueueDepth();
        return;
      }

      await this.handleMessage(item);
      await this.queueConsumer.markDone(item);
      this.metricsService.recordProcessedJob();
      this.metricsService.recordCallback(true);
    } catch (error) {
      if (this.isProcessingQueueMessage(error)) {
        await this.queueConsumer.markFailed(error);
      }
    } finally {
      await this.syncQueueDepth();
      this.processing = false;
    }
  }

  private async handleMessage(item: ProcessingQueueMessage): Promise<void> {
    const workerConfig = await this.assistantWorkerConfigService.read();
    const stopThinking = this.startThinkingLoop(item, workerConfig);
    const conversation = await this.conversationService.read(item);

    try {
      const result = await this.llmProvider.generateReply({
        conversation,
        message: item,
      });

      stopThinking();
      await this.callbackDeliveryService.sendResponse(
        item.host,
        item.conversation_id,
        result.message,
      );
      await this.conversationService.appendExchange(item, result);
    } catch {
      stopThinking();
      throw item;
    }
  }

  private startThinkingLoop(
    item: ProcessingQueueMessage,
    workerConfig: AssistantWorkerConfig,
  ): () => void {
    const delayMs = workerConfig.thinking_interval_seconds * 1000;

    const timer = setInterval(() => {
      void this.callbackDeliveryService.sendThinking(
        item.host,
        item.conversation_id,
        workerConfig.thinking_interval_seconds,
      );
    }, delayMs);

    return () => {
      clearInterval(timer);
    };
  }

  private async syncQueueDepth(): Promise<void> {
    this.metricsService.setQueueDepth(await this.queueConsumer.depth());
  }

  private isProcessingQueueMessage(value: unknown): value is ProcessingQueueMessage {
    return (
      typeof value === 'object' &&
      value !== null &&
      'processingToken' in value &&
      typeof value.processingToken === 'string'
    );
  }
}
