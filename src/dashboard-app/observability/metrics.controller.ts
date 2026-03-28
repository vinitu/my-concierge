import { Controller, Get, Header } from '@nestjs/common';
import { DashboardMetricsService } from './dashboard-metrics.service';

@Controller()
export class DashboardMetricsController {
  constructor(private readonly metricsService: DashboardMetricsService) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    this.metricsService.recordEndpointRequest('/metrics');
    return this.metricsService.render();
  }
}
