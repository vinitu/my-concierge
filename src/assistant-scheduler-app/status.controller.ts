import { Controller, Get } from "@nestjs/common";

@Controller("status")
export class AssistantSchedulerStatusController {
  @Get()
  getStatus(): {
    service: string;
    status: "ok";
  } {
    return {
      service: "assistant-scheduler",
      status: "ok",
    };
  }
}
