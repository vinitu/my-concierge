import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MysqlService } from '../persistence/mysql.service';
import { AssistantMemoryMetricsController } from './observability/assistant-memory-metrics.controller';
import { AssistantMemoryMetricsService } from './observability/assistant-memory-metrics.service';
import { HttpRequestMetricsInterceptor } from './observability/http-request-metrics.interceptor';
import { AssistantMemoryController } from './memory/assistant-memory.controller';
import { AssistantMemoryService } from './memory/assistant-memory.service';
import { AssistantMemoryOpenApiController } from './openapi.controller';
import { AssistantMemoryRootController } from './root.controller';
import { AssistantMemoryStatusController } from './status.controller';

@Module({
  controllers: [
    AssistantMemoryController,
    AssistantMemoryMetricsController,
    AssistantMemoryOpenApiController,
    AssistantMemoryRootController,
    AssistantMemoryStatusController,
  ],
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [
    AssistantMemoryMetricsService,
    MysqlService,
    AssistantMemoryService,
    HttpRequestMetricsInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpRequestMetricsInterceptor,
    },
  ],
})
export class AssistantMemoryAppModule {}
