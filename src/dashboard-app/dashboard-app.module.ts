import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DashboardOpenApiController } from './openapi.controller';
import { DashboardProxyController } from './dashboard-proxy.controller';
import { DashboardRootController } from './root.controller';
import { DashboardServicesController } from './dashboard-services.controller';
import { DashboardServiceRegistryService } from './dashboard-service-registry.service';
import { DashboardStatusController } from './status.controller';
import { DashboardStatusService } from './dashboard-status.service';
import { DashboardHttpRequestMetricsInterceptor } from './observability/http-request-metrics.interceptor';
import { DashboardMetricsController } from './observability/metrics.controller';
import { DashboardMetricsService } from './observability/dashboard-metrics.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [
    DashboardMetricsController,
    DashboardOpenApiController,
    DashboardProxyController,
    DashboardRootController,
    DashboardServicesController,
    DashboardStatusController,
  ],
  providers: [
    DashboardMetricsService,
    DashboardServiceRegistryService,
    DashboardStatusService,
    DashboardHttpRequestMetricsInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useClass: DashboardHttpRequestMetricsInterceptor,
    },
  ],
})
export class DashboardAppModule {}
