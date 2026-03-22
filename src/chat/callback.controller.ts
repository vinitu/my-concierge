import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { MetricsService } from '../observability/metrics.service';
import { SessionRegistryService } from './session-registry.service';

interface CallbackBody {
  message: string;
}

@Controller()
export class CallbackController {
  constructor(
    private readonly sessionRegistryService: SessionRegistryService,
    private readonly metricsService: MetricsService,
  ) {}

  @Post('callbacks/assistant/:contact')
  @HttpCode(200)
  deliverAssistantMessage(
    @Param('contact') contact: string,
    @Body() body: CallbackBody,
  ): { delivered: boolean; response: string } {
    const message = body.message?.trim() ?? '';
    const delivered =
      message.length > 0 &&
      this.sessionRegistryService.sendAssistantMessage(contact, message);

    this.metricsService.recordCallback(delivered);

    return {
      delivered,
      response: delivered ? 'Callback delivered' : 'WebSocket session not found',
    };
  }
}
