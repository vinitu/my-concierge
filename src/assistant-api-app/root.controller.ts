import { Controller, Get } from '@nestjs/common';

@Controller()
export class AssistantApiRootController {
  @Get()
  getRoot(): { docs: string; metrics: string; service: string; status: string } {
    return {
      docs: '/openapi.json',
      metrics: '/metrics',
      service: 'assistant-api',
      status: '/status',
    };
  }
}
