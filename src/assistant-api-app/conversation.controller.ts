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
  conversation_id?: string;
  message?: string;
}

@Controller()
export class ConversationController {
  constructor(
    private readonly metricsService: AssistantApiMetricsService,
    private readonly queueService: QueueService,
  ) {}

  @Post('conversation/:direction/:chat/:userId')
  @HttpCode(202)
  async acceptConversation(
    @Param('direction') direction: string,
    @Param('chat') chat: string,
    @Param('userId') userId: string,
    @Body() body: ConversationBody,
  ): Promise<{ request_id: string; status: string }> {
    const message = body.message?.trim() ?? '';
    const conversationId = body.conversation_id?.trim() ?? '';
    const requestId = randomUUID();

    if (!message) {
      throw new BadRequestException('message must not be empty');
    }

    if (!conversationId) {
      throw new BadRequestException('conversation_id must not be empty');
    }

    await this.queueService.enqueue({
      accepted_at: new Date().toISOString(),
      chat,
      conversation_id: conversationId,
      direction,
      message,
      request_id: requestId,
      user_id: userId,
    });

    this.metricsService.recordAcceptedConversation();
    await this.metricsService.refreshQueueDepth();

    return {
      request_id: requestId,
      status: 'accepted',
    };
  }
}
