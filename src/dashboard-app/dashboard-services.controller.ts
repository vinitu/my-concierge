import {
  Controller,
  Get,
} from '@nestjs/common';
import { DashboardMetricsService } from './observability/dashboard-metrics.service';
import {
  DashboardServiceStatus,
  DashboardStatusService,
} from './dashboard-status.service';
import {
  DashboardServiceDefinition,
  DashboardServiceRegistryService,
} from './dashboard-service-registry.service';

@Controller('services')
export class DashboardServicesController {
  constructor(
    private readonly dashboardMetricsService: DashboardMetricsService,
    private readonly dashboardServiceRegistryService: DashboardServiceRegistryService,
    private readonly dashboardStatusService: DashboardStatusService,
  ) {}

  @Get('catalog')
  getCatalog(): {
    refresh_seconds: number;
    services: DashboardServiceDefinition[];
  } {
    this.dashboardMetricsService.recordEndpointRequest('/services/catalog');
    return {
      refresh_seconds: this.dashboardStatusService.refreshSeconds(),
      services: this.dashboardServiceRegistryService.list(),
    };
  }

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
