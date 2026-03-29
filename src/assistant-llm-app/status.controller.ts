import {
  Controller,
  Get,
} from '@nestjs/common';

@Controller('status')
export class AssistantLlmStatusController {
  @Get()
  getStatus(): {
    service: string;
    status: 'ok';
  } {
    return {
      service: 'assistant-llm',
      status: 'ok',
    };
  }
}
