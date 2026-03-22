import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { MetricsService } from '../observability/metrics.service';
import { GatewayWebRuntimeService } from './gateway-web-runtime.service';
import { SessionRegistryService } from './session-registry.service';

interface CallbackBody {
  message: string;
}

@Controller()
export class CallbackController {
  constructor(
    private readonly gatewayWebRuntimeService: GatewayWebRuntimeService,
    private readonly sessionRegistryService: SessionRegistryService,
    private readonly metricsService: MetricsService,
  ) {}

  @Post('callbacks/assistant/:contact')
  @HttpCode(200)
  deliverAssistantMessage(
    @Param('contact') contact: string,
    @Body() body: CallbackBody,
  ): Promise<{ delivered: boolean; response: string }> {
    const message = body.message?.trim() ?? '';
    return this.handleDelivery(contact, message);
  }

  private async handleDelivery(
    contact: string,
    message: string,
  ): Promise<{ delivered: boolean; response: string }> {
    if (message.length > 0) {
      await this.gatewayWebRuntimeService.appendAssistantMessage(contact, message);
    }

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
