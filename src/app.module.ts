import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AssistantApiClientService } from './assistant-api/assistant-api-client.service';
import { CallbackController } from './chat/callback.controller';
import { GatewayWebGateway } from './chat/gateway-web.gateway';
import { SessionRegistryService } from './chat/session-registry.service';
import { HttpRequestMetricsInterceptor } from './observability/http-request-metrics.interceptor';
import { MetricsController } from './observability/metrics.controller';
import { MetricsService } from './observability/metrics.service';
import { GatewayWebOpenApiController } from './openapi.controller';
import { StatusController } from './observability/status.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [
    CallbackController,
    GatewayWebOpenApiController,
    MetricsController,
    StatusController,
  ],
  providers: [
    AssistantApiClientService,
    GatewayWebGateway,
    HttpRequestMetricsInterceptor,
    MetricsService,
    SessionRegistryService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpRequestMetricsInterceptor,
    },
  ],
})
export class AppModule {}
