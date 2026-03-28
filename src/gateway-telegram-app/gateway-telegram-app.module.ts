import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { GatewayTelegramAssistantApiClientService } from './assistant-api-client.service';
import { GatewayTelegramConfigService } from './gateway-telegram-config.service';
import { GatewayTelegramController } from './gateway-telegram.controller';
import { GatewayTelegramOpenApiController } from './openapi.controller';
import { GatewayTelegramRootController } from './root.controller';
import { GatewayTelegramRuntimeService } from './gateway-telegram-runtime.service';
import { GatewayTelegramStatusController } from './status.controller';
import { GatewayTelegramBotApiService } from './gateway-telegram-bot-api.service';
import { GATEWAY_TELEGRAM_TRANSPORT } from './gateway-telegram-transport';
import { GatewayTelegramHttpRequestMetricsInterceptor } from './observability/http-request-metrics.interceptor';
import { GatewayTelegramMetricsController } from './observability/metrics.controller';
import { GatewayTelegramMetricsService } from './observability/gateway-telegram-metrics.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [
    GatewayTelegramController,
    GatewayTelegramMetricsController,
    GatewayTelegramOpenApiController,
    GatewayTelegramRootController,
    GatewayTelegramStatusController,
  ],
  providers: [
    GatewayTelegramAssistantApiClientService,
    GatewayTelegramBotApiService,
    GatewayTelegramConfigService,
    GatewayTelegramMetricsService,
    GatewayTelegramRuntimeService,
    GatewayTelegramHttpRequestMetricsInterceptor,
    {
      provide: GATEWAY_TELEGRAM_TRANSPORT,
      useExisting: GatewayTelegramBotApiService,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: GatewayTelegramHttpRequestMetricsInterceptor,
    },
  ],
})
export class GatewayTelegramAppModule {}
