import { Controller, Get } from '@nestjs/common';
import { DashboardMetricsService } from './observability/dashboard-metrics.service';
import {
  DashboardServiceStatus,
  DashboardStatusService,
} from './dashboard-status.service';

@Controller('services')
export class DashboardServicesController {
  constructor(
    private readonly dashboardMetricsService: DashboardMetricsService,
    private readonly dashboardStatusService: DashboardStatusService,
  ) {}

  @Get('status')
  async getStatuses(): Promise<{ refresh_seconds: number; services: DashboardServiceStatus[] }> {
    this.dashboardMetricsService.recordEndpointRequest('/services/status');
    const statuses = await this.dashboardStatusService.listStatuses();

    for (const status of statuses) {
      this.dashboardMetricsService.recordUpstreamRequest(
        status.name,
        status.ready !== false,
      );
      this.dashboardMetricsService.setObservedService(status.name, status.ready);
    }

    return {
      refresh_seconds: this.dashboardStatusService.refreshSeconds(),
      services: statuses,
    };
  }
}
