import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import { MetricsService } from '../observability/metrics.service';
import { GatewayWebConfigService } from './gateway-web-config.service';
import { ConversationRegistryService } from './session-registry.service';

interface CallbackBody {
  message: string;
  error?: boolean;
  request_id?: string;
  sequence?: number;
}

interface ThinkingBody {
  seconds: number;
}

interface EventBody {
  message?: string;
  payload?: unknown;
  request_id?: string;
  sequence?: number;
  type?: string;
}

interface ToolBody {
  message?: string;
  ok?: boolean;
  payload?: unknown;
  request_id?: string;
  sequence?: number;
  tool_name?: string;
}

@Controller()
export class CallbackController {
  private readonly logger = new Logger(CallbackController.name);

  constructor(
    private readonly conversationRegistryService: ConversationRegistryService,
    private readonly metricsService: MetricsService,
    private readonly gatewayWebConfigService: GatewayWebConfigService,
  ) {}

  @Post('response/:conversationId')
  @HttpCode(200)
  deliverAssistantResponse(
    @Param('conversationId') conversationId: string,
    @Body() body: CallbackBody,
  ): Promise<{ delivered: boolean; response: string }> {
    this.logger.log(
      `Incoming response callback conversationId=${conversationId} error=${String(body.error === true)} messageLen=${String(
        body.message?.length ?? 0,
      )}`,
    );
    const message = body.message?.trim() ?? '';
    return this.handleResponseDelivery(
      conversationId,
      message,
      body.error === true,
      typeof body.request_id === 'string' ? body.request_id : undefined,
      typeof body.sequence === 'number' ? body.sequence : undefined,
    );
  }

  @Post('thinking/:conversationId')
  @HttpCode(200)
  async deliverAssistantThinking(
    @Param('conversationId') conversationId: string,
    @Body() body: ThinkingBody,
  ): Promise<{ delivered: boolean; response: string }> {
    this.logger.log(
      `Incoming thinking callback conversationId=${conversationId} seconds=${String(body.seconds)}`,
    );
    if (await this.shouldIgnoreIncomingMessageType('response.thinking')) {
      this.metricsService.recordCallback(false);
      return {
        delivered: false,
        response: 'Ignored by gateway-web settings',
      };
    }

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

  @Post('event/:conversationId')
  @HttpCode(200)
  async deliverAssistantEvent(
    @Param('conversationId') conversationId: string,
    @Body() body: EventBody,
  ): Promise<{ delivered: boolean; response: string }> {
    const type = body.type?.trim() || 'assistant.event';
    this.logger.log(
      `Incoming event callback conversationId=${conversationId} type=${type} messageLen=${String(
        body.message?.length ?? 0,
      )}`,
    );
    if (await this.shouldIgnoreIncomingMessageType(type)) {
      this.metricsService.recordCallback(false);
      return {
        delivered: false,
        response: 'Ignored by gateway-web settings',
      };
    }

    const delivered = this.conversationRegistryService.sendAssistantEvent(conversationId, {
      message: typeof body.message === 'string' ? body.message : undefined,
      payload: body.payload,
      request_id: typeof body.request_id === 'string' ? body.request_id : undefined,
      sequence: typeof body.sequence === 'number' ? body.sequence : undefined,
      type,
    });

    this.metricsService.recordCallback(delivered);
    return {
      delivered,
      response: delivered ? 'Event callback delivered' : 'WebSocket conversation not found',
    };
  }

  @Post('tool/:conversationId')
  @HttpCode(200)
  async deliverAssistantTool(
    @Param('conversationId') conversationId: string,
    @Body() body: ToolBody,
  ): Promise<{ delivered: boolean; response: string }> {
    const toolName = body.tool_name?.trim() || 'unknown_tool';
    this.logger.log(
      `Incoming tool callback conversationId=${conversationId} tool=${toolName} ok=${String(body.ok === true)}`,
    );
    if (await this.shouldIgnoreIncomingMessageType('response.tool')) {
      this.metricsService.recordCallback(false);
      return {
        delivered: false,
        response: 'Ignored by gateway-web settings',
      };
    }

    const delivered = this.conversationRegistryService.sendAssistantEvent(conversationId, {
      message: typeof body.message === 'string' ? body.message : undefined,
      payload: {
        ok: body.ok === true,
        payload: body.payload,
        tool_name: toolName,
      },
      request_id: typeof body.request_id === 'string' ? body.request_id : undefined,
      sequence: typeof body.sequence === 'number' ? body.sequence : undefined,
      type: `tool.${toolName}.${body.ok === true ? 'ok' : 'failed'}`,
    });

    this.metricsService.recordCallback(delivered);
    return {
      delivered,
      response: delivered ? 'Tool callback delivered' : 'WebSocket conversation not found',
    };
  }

  private async handleResponseDelivery(
    conversationId: string,
    message: string,
    error: boolean,
    requestId?: string,
    sequence?: number,
  ): Promise<{ delivered: boolean; response: string }> {
    const messageType = error ? 'response.error' : 'response.message';
    if (await this.shouldIgnoreIncomingMessageType(messageType)) {
      this.metricsService.recordCallback(false);
      return {
        delivered: false,
        response: 'Ignored by gateway-web settings',
      };
    }

    const delivered =
      message.length > 0 &&
      (error
        ? this.conversationRegistryService.sendAssistantErrorWithMeta(conversationId, {
            message,
            request_id: requestId,
            sequence,
          })
        : this.conversationRegistryService.sendAssistantMessageWithMeta(conversationId, {
            message,
            request_id: requestId,
            sequence,
          }));

    this.metricsService.recordCallback(delivered);

    return {
      delivered,
      response: delivered ? 'Callback delivered' : 'WebSocket conversation not found',
    };
  }

  private async shouldIgnoreIncomingMessageType(
    incomingMessageType: string,
  ): Promise<boolean> {
    const config = await this.gatewayWebConfigService.read();
    return !config.allowed_incoming_message_types.includes(incomingMessageType);
  }
}
