import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AssistantSchedulerConfigService } from "./assistant-scheduler-config.service";
import { AssistantSchedulerController } from "./assistant-scheduler.controller";
import { AssistantSchedulerOpenApiController } from "./openapi.controller";
import { AssistantSchedulerRootController } from "./root.controller";
import { AssistantSchedulerService } from "./assistant-scheduler.service";
import { AssistantSchedulerStatusController } from "./status.controller";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [
    AssistantSchedulerController,
    AssistantSchedulerOpenApiController,
    AssistantSchedulerRootController,
    AssistantSchedulerStatusController,
  ],
  providers: [AssistantSchedulerConfigService, AssistantSchedulerService],
})
export class AssistantSchedulerAppModule {}
