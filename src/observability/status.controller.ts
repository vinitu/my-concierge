import { Controller, Get } from '@nestjs/common';
import { MetricsService } from './metrics.service';

@Controller()
export class StatusController {
  constructor(private readonly metricsService: MetricsService) {}

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
      service: 'gateway-web',
      status: 'ok',
      uptime_seconds: Math.floor(process.uptime()),
    };
  }
}
