import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { MetricsService } from '../observability/metrics.service';
import { ConversationRegistryService } from './session-registry.service';

interface CallbackBody {
  message: string;
}

interface ThinkingBody {
  seconds: number;
}

@Controller()
export class CallbackController {
  constructor(
    private readonly conversationRegistryService: ConversationRegistryService,
    private readonly metricsService: MetricsService,
  ) {}

  @Post('response/:conversationId')
  @HttpCode(200)
  deliverAssistantResponse(
    @Param('conversationId') conversationId: string,
    @Body() body: CallbackBody,
  ): Promise<{ delivered: boolean; response: string }> {
    const message = body.message?.trim() ?? '';
    return this.handleResponseDelivery(conversationId, message);
  }

  @Post('thinking/:conversationId')
  @HttpCode(200)
  deliverAssistantThinking(
    @Param('conversationId') conversationId: string,
    @Body() body: ThinkingBody,
  ): { delivered: boolean; response: string } {
    const seconds =
      typeof body.seconds === 'number' && Number.isFinite(body.seconds)
        ? Math.max(1, Math.floor(body.seconds))
        : 1;
    const delivered = this.conversationRegistryService.sendAssistantThinking(
      conversationId,
      seconds,
    );

    this.metricsService.recordCallback(delivered);

    return {
      delivered,
      response: delivered ? 'Thinking callback delivered' : 'WebSocket conversation not found',
    };
  }

  private async handleResponseDelivery(
    conversationId: string,
    message: string,
  ): Promise<{ delivered: boolean; response: string }> {
    const delivered =
      message.length > 0 &&
      this.conversationRegistryService.sendAssistantMessage(conversationId, message);

    this.metricsService.recordCallback(delivered);

    return {
      delivered,
      response: delivered ? 'Callback delivered' : 'WebSocket conversation not found',
    };
  }
}
