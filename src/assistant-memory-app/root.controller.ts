import { Controller, Get } from '@nestjs/common';

@Controller()
export class AssistantMemoryRootController {
  @Get()
  getRoot(): { docs: string; metrics: string; service: string; status: string } {
    return {
      docs: '/openapi.json',
      metrics: '/metrics',
      service: 'assistant-memory',
      status: '/status',
    };
  }
}
