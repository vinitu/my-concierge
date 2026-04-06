import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { GatewayEmailAssistantApiClientService } from './assistant-api-client.service';
import { GatewayEmailConfigService } from './gateway-email-config.service';
import { GatewayEmailRuntimeService } from './gateway-email-runtime.service';
import { GatewayEmailSyncService } from './gateway-email-sync.service';
import { GATEWAY_EMAIL_TRANSPORT, type GatewayEmailInboundMessage, type GatewayEmailTransport } from './gateway-email-transport';
import { GatewayEmailMetricsService } from './observability/gateway-email-metrics.service';
import { Inject } from '@nestjs/common';

interface CallbackBody {
  message: string;
}

interface ThinkingBody {
  seconds: number;
}

interface ToolBody {
  ok?: boolean;
  tool_name?: string;
}

@Controller()
export class GatewayEmailController {
  constructor(
    private readonly assistantApiClientService: GatewayEmailAssistantApiClientService,
    private readonly gatewayEmailConfigService: GatewayEmailConfigService,
    private readonly gatewayEmailRuntimeService: GatewayEmailRuntimeService,
    private readonly gatewayEmailSyncService: GatewayEmailSyncService,
    private readonly metricsService: GatewayEmailMetricsService,
    @Inject(GATEWAY_EMAIL_TRANSPORT)
    private readonly transport: GatewayEmailTransport,
  ) {}

  @Get('threads')
  async listThreads() {
    this.metricsService.recordEndpointRequest('/threads');
    return {
      threads: await this.gatewayEmailRuntimeService.listThreads(),
    };
  }

  @Get('threads/:conversationId')
  async getThread(@Param('conversationId') conversationId: string) {
    this.metricsService.recordEndpointRequest('/threads/:conversationId');
    return this.gatewayEmailRuntimeService.getThread(conversationId);
  }

  @Post('sync')
  @HttpCode(200)
  async triggerSync() {
    this.metricsService.recordEndpointRequest('/sync');
    return this.gatewayEmailSyncService.triggerSync();
  }

  @Post('inbound/email')
  @HttpCode(202)
  async acceptInboundEmail(@Body() body: GatewayEmailInboundMessage) {
    this.metricsService.recordEndpointRequest('/inbound/email');
    this.metricsService.recordIncomingMessage('manual');
    const ingestion = await this.gatewayEmailRuntimeService.ingestInbound('INBOX', {
      ...body,
      references: Array.isArray(body.references) ? body.references : [],
      to: Array.isArray(body.to) ? body.to : [],
    });

    if (!ingestion.duplicate && body.text.trim().length > 0) {
      await this.assistantApiClientService.sendConversation({
        conversationId: ingestion.conversation_id,
        mailbox: ingestion.thread.mailbox,
        message: body.text,
        userId: ingestion.thread.contact || body.from,
      });
    }

    this.metricsService.setThreadCount((await this.gatewayEmailRuntimeService.listThreads()).length);

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

    const config = await this.gatewayEmailConfigService.read();
    const replyContext = await this.gatewayEmailRuntimeService.prepareReply(conversationId);

    if (!this.gatewayEmailConfigService.isReady(config) || !replyContext.to) {
      this.metricsService.recordCallback(false);
      return {
        delivered: false,
        response: 'Email gateway is not ready or thread was not found',
      };
    }

    const result = await this.transport.sendReply(config, {
      in_reply_to: replyContext.in_reply_to,
      references: replyContext.references,
      subject: replyContext.subject,
      text: message,
      to: replyContext.to,
    });
    this.metricsService.recordUpstreamRequest('smtp', true);
    await this.gatewayEmailRuntimeService.appendOutbound(
      conversationId,
      message,
      result,
      replyContext.to,
      replyContext.subject,
      replyContext.in_reply_to,
      replyContext.references,
    );
    this.metricsService.recordCallback(true);
    this.metricsService.setThreadCount((await this.gatewayEmailRuntimeService.listThreads()).length);

    return {
      delivered: true,
      response: 'Email reply sent',
    };
  }

  @Post('thinking/:conversationId')
  @HttpCode(200)
  deliverAssistantThinking(
    @Param('conversationId') conversationId: string,
    @Body() body: ThinkingBody,
  ): { delivered: boolean; response: string; seconds: number; conversation_id: string } {
    this.metricsService.recordEndpointRequest('/thinking/:conversationId');
    const seconds =
      typeof body.seconds === 'number' && Number.isFinite(body.seconds)
        ? Math.max(1, Math.floor(body.seconds))
        : 1;
    this.metricsService.recordCallback(true);

    return {
      conversation_id: conversationId,
      delivered: true,
      response: 'Thinking callback acknowledged for email',
      seconds,
    };
  }

  @Post('tool/:conversationId')
  @HttpCode(200)
  deliverAssistantTool(
    @Param('conversationId') conversationId: string,
    @Body() body: ToolBody,
  ): { conversation_id: string; delivered: boolean; response: string; tool_name: string } {
    this.metricsService.recordEndpointRequest('/tool/:conversationId');
    this.metricsService.recordCallback(true);

    return {
      conversation_id: conversationId,
      delivered: true,
      response: body.ok === true ? 'Tool callback acknowledged for email' : 'Tool failure callback acknowledged for email',
      tool_name:
        typeof body.tool_name === 'string' && body.tool_name.trim().length > 0
          ? body.tool_name.trim()
          : 'unknown_tool',
    };
  }
}
