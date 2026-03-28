import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AssistantApiClientService } from './assistant-api/assistant-api-client.service';
import { CallbackController } from './chat/callback.controller';
import { ChatPageController } from './chat/chat-page.controller';
import { GatewayWebConfigService } from './chat/gateway-web-config.service';
import { GatewayWebGateway } from './chat/gateway-web.gateway';
import { GatewayWebRootController } from './chat/gateway-web-root.controller';
import { GatewayWebRuntimeService } from './chat/gateway-web-runtime.service';
import { ConversationRegistryService } from './chat/session-registry.service';
import { HttpRequestMetricsInterceptor } from './observability/http-request-metrics.interceptor';
import { MetricsController } from './observability/metrics.controller';
import { MetricsService } from './observability/metrics.service';
import { GatewayWebOpenApiController } from './openapi.controller';
import { StatusController } from './observability/status.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [
    ChatPageController,
    CallbackController,
    GatewayWebRootController,
    GatewayWebOpenApiController,
    MetricsController,
    StatusController,
  ],
  providers: [
    AssistantApiClientService,
    GatewayWebConfigService,
    GatewayWebRuntimeService,
    GatewayWebGateway,
    HttpRequestMetricsInterceptor,
    MetricsService,
    ConversationRegistryService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpRequestMetricsInterceptor,
    },
  ],
})
export class AppModule {}
