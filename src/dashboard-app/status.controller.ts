import { Controller, Get } from '@nestjs/common';
import { DashboardMetricsService } from './observability/dashboard-metrics.service';

@Controller()
export class DashboardStatusController {
  constructor(private readonly metricsService: DashboardMetricsService) {}

  @Get('status')
  getStatus(): {
    ready: boolean;
    service: string;
    status: string;
    uptime_seconds: number;
  } {
    this.metricsService.recordEndpointRequest('/status');
    return {
      ready: true,
      service: 'dashboard',
      status: 'ok',
      uptime_seconds: Math.floor(process.uptime()),
    };
  }
}
