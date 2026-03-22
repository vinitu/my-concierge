import {
  Controller,
  Get,
  Header,
} from '@nestjs/common';
import { AssistantWorkerMetricsService } from './assistant-worker-metrics.service';

@Controller()
export class AssistantWorkerMetricsController {
  constructor(private readonly metricsService: AssistantWorkerMetricsService) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    this.metricsService.recordMetricsRequest();
    return this.metricsService.render();
  }
}

