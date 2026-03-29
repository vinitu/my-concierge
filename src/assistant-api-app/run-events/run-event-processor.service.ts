import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssistantApiMetricsService } from '../observability/assistant-api-metrics.service';
import {
  RUN_EVENT_QUEUE_CONSUMER,
  type RunEventQueueConsumer,
} from './run-event-queue';
import { CallbackDeliveryService } from './callback-delivery.service';

@Injectable()
export class RunEventProcessorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RunEventProcessorService.name);
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(
    private readonly callbackDeliveryService: CallbackDeliveryService,
    private readonly configService: ConfigService,
    private readonly metricsService: AssistantApiMetricsService,
    @Inject(RUN_EVENT_QUEUE_CONSUMER)
    private readonly runEventQueueConsumer: RunEventQueueConsumer,
  ) {}

  onModuleInit(): void {
    const pollIntervalMs = Number.parseInt(
      this.configService.get<string>('RUN_EVENT_POLL_INTERVAL_MS', '250'),
      10,
    );

    this.timer = setInterval(() => {
      void this.processOnce();
    }, pollIntervalMs);
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
      const event = await this.runEventQueueConsumer.consumeNext();

      if (!event) {
        return;
      }

      this.logger.log(
        `Run event received eventType=${event.eventType} direction=${event.direction} userId=${event.userId} requestId=${event.requestId} conversationId=${event.conversationId}`,
      );

      const delivered = await this.callbackDeliveryService.deliver(event);
      this.metricsService.recordCallbackDelivery(delivered);
    } finally {
      this.processing = false;
    }
  }
}
