import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import type {
  AssistantSchedulerConfig,
  AssistantSchedulerJob,
  AssistantSchedulerJobCreateRequest,
  AssistantSchedulerJobUpdateRequest,
  UpdateAssistantSchedulerConfigBody,
} from "../contracts/assistant-scheduler";
import { AssistantSchedulerConfigService } from "./assistant-scheduler-config.service";
import { AssistantSchedulerService } from "./assistant-scheduler.service";

@Controller()
export class AssistantSchedulerController {
  constructor(
    private readonly assistantSchedulerConfigService: AssistantSchedulerConfigService,
    private readonly assistantSchedulerService: AssistantSchedulerService,
  ) {}

  @Get("config")
  getConfig(): Promise<AssistantSchedulerConfig> {
    return this.assistantSchedulerConfigService.read();
  }

  @Put("config")
  updateConfig(
    @Body() body: UpdateAssistantSchedulerConfigBody,
  ): Promise<AssistantSchedulerConfig> {
    return this.assistantSchedulerConfigService.write(body);
  }

  @Get("v1/jobs")
  listJobs(): Promise<AssistantSchedulerJob[]> {
    return this.assistantSchedulerService.listJobs();
  }

  @Post("v1/jobs")
  createJob(
    @Body() body: AssistantSchedulerJobCreateRequest,
  ): Promise<AssistantSchedulerJob> {
    return this.assistantSchedulerService.createJob(body);
  }

  @Put("v1/jobs/:jobId")
  updateJob(
    @Param("jobId") jobId: string,
    @Body() body: AssistantSchedulerJobUpdateRequest,
  ): Promise<AssistantSchedulerJob> {
    return this.assistantSchedulerService.updateJob(jobId, body);
  }

  @Delete("v1/jobs/:jobId")
  deleteJob(@Param("jobId") jobId: string): Promise<{ status: "deleted" }> {
    return this.assistantSchedulerService.deleteJob(jobId);
  }

  @Post("v1/jobs/:jobId/run")
  runNow(@Param("jobId") jobId: string): Promise<AssistantSchedulerJob> {
    return this.assistantSchedulerService.runJobNow(jobId);
  }

  @Post("v1/dispatch-due")
  dispatchDueNow(): Promise<{ dispatched: number }> {
    return this.assistantSchedulerService.dispatchDueNow();
  }
}
