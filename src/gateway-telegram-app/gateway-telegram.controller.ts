import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import { GatewayTelegramAssistantApiClientService } from './assistant-api-client.service';
import { GatewayTelegramConfigService } from './gateway-telegram-config.service';
import { GatewayTelegramRuntimeService } from './gateway-telegram-runtime.service';
import {
  GATEWAY_TELEGRAM_TRANSPORT,
  type GatewayTelegramInboundMessage,
  type GatewayTelegramTransport,
} from './gateway-telegram-transport';
import { GatewayTelegramMetricsService } from './observability/gateway-telegram-metrics.service';

interface CallbackBody {
  message: string;
}

interface ThinkingBody {
  seconds: number;
}

@Controller()
export class GatewayTelegramController {
  constructor(
    private readonly assistantApiClientService: GatewayTelegramAssistantApiClientService,
    private readonly gatewayTelegramConfigService: GatewayTelegramConfigService,
    private readonly gatewayTelegramRuntimeService: GatewayTelegramRuntimeService,
    private readonly metricsService: GatewayTelegramMetricsService,
    @Inject(GATEWAY_TELEGRAM_TRANSPORT)
    private readonly transport: GatewayTelegramTransport,
  ) {}

  @Get('threads')
  async listThreads() {
    this.metricsService.recordEndpointRequest('/threads');
    return {
      threads: await this.gatewayTelegramRuntimeService.listThreads(),
    };
  }

  @Get('threads/:conversationId')
  async getThread(@Param('conversationId') conversationId: string) {
    this.metricsService.recordEndpointRequest('/threads/:conversationId');
    return this.gatewayTelegramRuntimeService.getThread(conversationId);
  }

  @Post('inbound/telegram')
  @HttpCode(202)
  async acceptInboundTelegram(@Body() body: GatewayTelegramInboundMessage) {
    this.metricsService.recordEndpointRequest('/inbound/telegram');
    this.metricsService.recordIncomingMessage('manual');
    const text = body.text?.trim() ?? '';
    const ingestion = await this.gatewayTelegramRuntimeService.ingestInbound({
      chat_id: String(body.chat_id),
      from_id: String(body.from_id),
      from_username:
        typeof body.from_username === 'string' ? body.from_username : null,
      message_id: Number(body.message_id),
      message_thread_id:
        typeof body.message_thread_id === 'number'
          ? body.message_thread_id
          : null,
      received_at: body.received_at,
      text,
    });

    if (!ingestion.duplicate && text.length > 0) {
      await this.assistantApiClientService.sendConversation({
        chat: ingestion.thread.chat_id,
        conversationId: ingestion.conversation_id,
        message: text,
        userId: ingestion.thread.contact,
      });
    }

    this.metricsService.setThreadCount(
      (await this.gatewayTelegramRuntimeService.listThreads()).length,
    );

    return {
      accepted: !ingestion.duplicate,
      conversation_id: ingestion.conversation_id,
      duplicate: ingestion.duplicate,
    };
  }

  @Post('response/:conversationId')
  @HttpCode(200)
  async deliverAssistantResponse(
    @Param('conversationId') conversationId: string,
    @Body() body: CallbackBody,
  ): Promise<{ delivered: boolean; response: string }> {
    this.metricsService.recordEndpointRequest('/response/:conversationId');
    const message = body.message?.trim() ?? '';

    if (!message) {
      this.metricsService.recordCallback(false);
      return {
        delivered: false,
        response: 'Assistant reply is empty',
      };
    }

    const config = await this.gatewayTelegramConfigService.read();
    const replyContext =
      await this.gatewayTelegramRuntimeService.prepareReply(conversationId);

    if (
      !this.gatewayTelegramConfigService.isReady(config) ||
      !replyContext.chat_id
    ) {
      this.metricsService.recordCallback(false);
      return {
        delivered: false,
        response: 'Telegram gateway is not ready or thread was not found',
      };
    }

    const result = await this.transport.sendMessage(config, {
      chat_id: replyContext.chat_id,
      message_thread_id: replyContext.message_thread_id,
      reply_to_message_id: replyContext.reply_to_message_id,
      text: message,
    });
    this.metricsService.recordUpstreamRequest('telegram', true);
    await this.gatewayTelegramRuntimeService.appendOutbound(
      conversationId,
      message,
      result,
    );
    this.metricsService.recordCallback(true);
    this.metricsService.setThreadCount(
      (await this.gatewayTelegramRuntimeService.listThreads()).length,
    );

    return {
      delivered: true,
      response: 'Telegram reply sent',
    };
  }

  @Post('thinking/:conversationId')
  @HttpCode(200)
  deliverAssistantThinking(
    @Param('conversationId') conversationId: string,
    @Body() body: ThinkingBody,
  ): { conversation_id: string; delivered: boolean; response: string; seconds: number } {
    this.metricsService.recordEndpointRequest('/thinking/:conversationId');
    const seconds =
      typeof body.seconds === 'number' && Number.isFinite(body.seconds)
        ? Math.max(1, Math.floor(body.seconds))
        : 1;
    this.metricsService.recordCallback(true);

    return {
      conversation_id: conversationId,
      delivered: true,
      response: 'Thinking callback acknowledged for Telegram',
      seconds,
    };
  }
}
