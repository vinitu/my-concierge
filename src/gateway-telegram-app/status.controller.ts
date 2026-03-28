import { Controller, Get } from '@nestjs/common';
import { GatewayTelegramConfigService } from './gateway-telegram-config.service';
import { GatewayTelegramMetricsService } from './observability/gateway-telegram-metrics.service';

@Controller()
export class GatewayTelegramStatusController {
  constructor(
    private readonly gatewayTelegramConfigService: GatewayTelegramConfigService,
    private readonly metricsService: GatewayTelegramMetricsService,
  ) {}

  @Get('status')
  async getStatus(): Promise<{
    configured: boolean;
    ready: boolean;
    service: string;
    status: string;
    uptime_seconds: number;
  }> {
    this.metricsService.recordEndpointRequest('/status');
    const config = await this.gatewayTelegramConfigService.read();

    return {
      configured: this.gatewayTelegramConfigService.isReady(config),
      ready: true,
      service: 'gateway-telegram',
      status: 'ok',
      uptime_seconds: Math.floor(process.uptime()),
    };
  }
}
