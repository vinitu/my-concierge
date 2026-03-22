import { Controller, Get } from '@nestjs/common';

@Controller()
export class AssistantWorkerRootController {
  @Get()
  getRoot(): { docs: string; metrics: string; service: string; status: string } {
    return {
      docs: '/openapi.json',
      metrics: '/metrics',
      service: 'assistant-worker',
      status: '/status',
    };
  }
}
