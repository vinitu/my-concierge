import {
  Controller,
  Get,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssistantWorkerMetricsService } from './observability/assistant-worker-metrics.service';
import {
  WORKER_QUEUE_CONSUMER,
  type QueueConsumer,
} from './queue/queue-consumer';

@Controller()
export class AssistantWorkerStatusController {
  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: AssistantWorkerMetricsService,
    @Inject(WORKER_QUEUE_CONSUMER) private readonly queueConsumer: QueueConsumer,
  ) {}

  @Get('status')
  getStatus(): {
    conversationStore: string;
    queueAdapter: string;
    ready: boolean;
    service: string;
    status: string;
    uptime_seconds: number;
  } {
    this.metricsService.recordStatusRequest();

    return {
      conversationStore: this.configService.get<string>(
        'ASSISTANT_CONVERSATION_STORE_DRIVER',
        'mysql',
      ),
      queueAdapter: this.queueConsumer.driverName(),
      ready: true,
      service: 'assistant-worker',
      status: 'ok',
      uptime_seconds: Math.floor(process.uptime()),
    };
  }
}
