import { Controller, Get, Header } from '@nestjs/common';
import { GatewayEmailMetricsService } from './gateway-email-metrics.service';

@Controller()
export class GatewayEmailMetricsController {
  constructor(private readonly metricsService: GatewayEmailMetricsService) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    this.metricsService.recordEndpointRequest('/metrics');
    return this.metricsService.render();
  }
}
