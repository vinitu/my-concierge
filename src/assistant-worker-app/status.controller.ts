import {
  Controller,
  Get,
  Inject,
} from '@nestjs/common';
import { AssistantWorkerMetricsService } from './observability/assistant-worker-metrics.service';
import {
  WORKER_QUEUE_CONSUMER,
  type QueueConsumer,
} from './queue/queue-consumer';

@Controller()
export class AssistantWorkerStatusController {
  constructor(
    private readonly metricsService: AssistantWorkerMetricsService,
    @Inject(WORKER_QUEUE_CONSUMER) private readonly queueConsumer: QueueConsumer,
  ) {}

  @Get('status')
  getStatus(): { queueAdapter: string; ready: boolean; service: string; status: string } {
    this.metricsService.recordStatusRequest();

    return {
      queueAdapter: this.queueConsumer.driverName(),
      ready: true,
      service: 'assistant-worker',
      status: 'ok',
    };
  }
}
