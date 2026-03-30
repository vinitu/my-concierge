import { Controller, Get } from "@nestjs/common";

@Controller()
export class AssistantSchedulerOpenApiController {
  @Get("openapi.json")
  getOpenApi(): Record<string, unknown> {
    return {
      openapi: "3.1.0",
      info: {
        title: "assistant-scheduler",
        version: "1.0.0",
      },
      paths: {
        "/config": {
          get: { summary: "Read scheduler config" },
          put: { summary: "Update scheduler config" },
        },
        "/v1/jobs": {
          get: { summary: "List scheduler jobs" },
          post: { summary: "Create scheduler job" },
        },
        "/v1/jobs/{jobId}": {
          put: { summary: "Update scheduler job" },
          delete: { summary: "Delete scheduler job" },
        },
        "/v1/jobs/{jobId}/run": {
          post: { summary: "Run scheduler job now" },
        },
        "/v1/dispatch-due": {
          post: { summary: "Dispatch currently due jobs once" },
        },
        "/status": {
          get: { summary: "Scheduler service health" },
        },
      },
    };
  }
}
