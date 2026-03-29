import {
  Controller,
  Get,
  Inject,
} from '@nestjs/common';
import { AssistantOrchestratorMetricsService } from './observability/assistant-orchestrator-metrics.service';
import {
  WORKER_QUEUE_CONSUMER,
  type QueueConsumer,
} from './queue/queue-consumer';

@Controller()
export class AssistantOrchestratorStatusController {
  constructor(
    private readonly metricsService: AssistantOrchestratorMetricsService,
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
      conversationStore: 'assistant-memory',
      queueAdapter: this.queueConsumer.driverName(),
      ready: true,
      service: 'assistant-orchestrator',
      status: 'ok',
      uptime_seconds: Math.floor(process.uptime()),
    };
  }
}
