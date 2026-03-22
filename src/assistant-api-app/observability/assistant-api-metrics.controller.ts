import {
  Controller,
  Get,
  Header,
} from '@nestjs/common';
import { AssistantApiMetricsService } from './assistant-api-metrics.service';

@Controller()
export class AssistantApiMetricsController {
  constructor(private readonly metricsService: AssistantApiMetricsService) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    this.metricsService.recordMetricsRequest();
    await this.metricsService.refreshQueueDepth();
    return this.metricsService.render();
  }
}

