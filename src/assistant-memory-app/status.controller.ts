import { Controller, Get } from '@nestjs/common';
import { AssistantMemoryMetricsService } from './observability/assistant-memory-metrics.service';

@Controller()
export class AssistantMemoryStatusController {
  constructor(private readonly metricsService: AssistantMemoryMetricsService) {}

  @Get('status')
  getStatus(): {
    ready: boolean;
    service: string;
    status: string;
    uptime_seconds: number;
  } {
    this.metricsService.recordStatusRequest();

    return {
      ready: true,
      service: 'assistant-memory',
      status: 'ok',
      uptime_seconds: Math.floor(process.uptime()),
    };
  }
}
