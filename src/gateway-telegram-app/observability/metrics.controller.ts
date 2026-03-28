import { Controller, Get, Header } from '@nestjs/common';
import { GatewayTelegramMetricsService } from './gateway-telegram-metrics.service';

@Controller()
export class GatewayTelegramMetricsController {
  constructor(private readonly metricsService: GatewayTelegramMetricsService) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    this.metricsService.recordEndpointRequest('/metrics');
    return this.metricsService.render();
  }
}
