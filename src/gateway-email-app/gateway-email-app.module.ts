import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { GatewayEmailAssistantApiClientService } from './assistant-api-client.service';
import { GatewayEmailConfigService } from './gateway-email-config.service';
import { GatewayEmailController } from './gateway-email.controller';
import { GatewayEmailImapSmtpService } from './gateway-email-imap-smtp.service';
import { GatewayEmailOpenApiController } from './openapi.controller';
import { GatewayEmailRootController } from './root.controller';
import { GatewayEmailRuntimeService } from './gateway-email-runtime.service';
import { GatewayEmailStatusController } from './status.controller';
import { GatewayEmailSyncService } from './gateway-email-sync.service';
import { GATEWAY_EMAIL_TRANSPORT } from './gateway-email-transport';
import { GatewayEmailHttpRequestMetricsInterceptor } from './observability/http-request-metrics.interceptor';
import { GatewayEmailMetricsController } from './observability/metrics.controller';
import { GatewayEmailMetricsService } from './observability/gateway-email-metrics.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [
    GatewayEmailController,
    GatewayEmailMetricsController,
    GatewayEmailOpenApiController,
    GatewayEmailRootController,
    GatewayEmailStatusController,
  ],
  providers: [
    GatewayEmailAssistantApiClientService,
    GatewayEmailConfigService,
    GatewayEmailImapSmtpService,
    GatewayEmailMetricsService,
    GatewayEmailRuntimeService,
    GatewayEmailSyncService,
    GatewayEmailHttpRequestMetricsInterceptor,
    {
      provide: GATEWAY_EMAIL_TRANSPORT,
      useExisting: GatewayEmailImapSmtpService,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: GatewayEmailHttpRequestMetricsInterceptor,
    },
  ],
})
export class GatewayEmailAppModule {}
