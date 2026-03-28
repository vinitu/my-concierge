import { Controller, Get, Header } from '@nestjs/common';
import { AssistantMemoryMetricsService } from './assistant-memory-metrics.service';

@Controller()
export class AssistantMemoryMetricsController {
  constructor(private readonly metricsService: AssistantMemoryMetricsService) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    this.metricsService.recordMetricsRequest();
    return this.metricsService.render();
  }
}
