import { Controller, Get } from '@nestjs/common';
import { QueueService } from './queue/queue.service';
import { AssistantApiMetricsService } from './observability/assistant-api-metrics.service';

@Controller()
export class AssistantApiStatusController {
  constructor(
    private readonly metricsService: AssistantApiMetricsService,
    private readonly queueService: QueueService,
  ) {}

  @Get('status')
  getStatus(): { queueAdapter: string; ready: boolean; service: string; status: string } {
    this.metricsService.recordStatusRequest();

    return {
      queueAdapter: this.queueService.driverName(),
      ready: true,
      service: 'assistant-api',
      status: 'ok',
    };
  }
}

