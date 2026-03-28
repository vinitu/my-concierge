import { Controller, Get } from '@nestjs/common';
import { GatewayEmailConfigService } from './gateway-email-config.service';
import { GatewayEmailMetricsService } from './observability/gateway-email-metrics.service';

@Controller()
export class GatewayEmailStatusController {
  constructor(
    private readonly gatewayEmailConfigService: GatewayEmailConfigService,
    private readonly metricsService: GatewayEmailMetricsService,
  ) {}

  @Get('status')
  async getStatus(): Promise<{
    ready: boolean;
    service: string;
    status: string;
    configured: boolean;
    uptime_seconds: number;
  }> {
    this.metricsService.recordEndpointRequest('/status');
    const config = await this.gatewayEmailConfigService.read();

    return {
      configured: this.gatewayEmailConfigService.isReady(config),
      ready: true,
      service: 'gateway-email',
      status: 'ok',
      uptime_seconds: Math.floor(process.uptime()),
    };
  }
}
