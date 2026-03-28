import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AssistantApiMetricsService } from './observability/assistant-api-metrics.service';
import { QueueService } from './queue/queue.service';

interface ConversationBody {
  callback?: {
    base_url?: string;
  };
  conversation_id?: string;
  message?: string;
}

@Controller()
export class ConversationController {
  constructor(
    private readonly metricsService: AssistantApiMetricsService,
    private readonly queueService: QueueService,
  ) {}

  @Post('conversation/:direction/:chat/:contact')
  @HttpCode(202)
  async acceptConversation(
    @Param('direction') direction: string,
    @Param('chat') chat: string,
    @Param('contact') contact: string,
    @Body() body: ConversationBody,
  ): Promise<{ request_id: string; status: string }> {
    const message = body.message?.trim() ?? '';
    const callbackBaseUrl = body.callback?.base_url?.trim() ?? '';
    const conversationId = body.conversation_id?.trim() ?? '';
    const requestId = randomUUID();

    if (!message) {
      throw new BadRequestException('message must not be empty');
    }

    if (!callbackBaseUrl) {
      throw new BadRequestException('callback.base_url must not be empty');
    }

    if (!conversationId) {
      throw new BadRequestException('conversation_id must not be empty');
    }

    await this.queueService.enqueue({
      accepted_at: new Date().toISOString(),
      callback: {
        base_url: callbackBaseUrl,
      },
      chat,
      conversation_id: conversationId,
      contact,
      direction,
      message,
      request_id: requestId,
    });

    this.metricsService.recordAcceptedConversation();
    await this.metricsService.refreshQueueDepth();

    return {
      request_id: requestId,
      status: 'accepted',
    };
  }
}
