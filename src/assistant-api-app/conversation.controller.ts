import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { AssistantApiMetricsService } from './observability/assistant-api-metrics.service';
import { QueueService } from './queue/queue.service';

interface ConversationBody {
  conversation_id?: string;
  host?: string;
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
  ): Promise<{ status: string }> {
    const message = body.message?.trim() ?? '';
    const host = body.host?.trim() ?? '';
    const conversationId = body.conversation_id?.trim() ?? '';

    if (!message) {
      throw new BadRequestException('message must not be empty');
    }

    if (!host) {
      throw new BadRequestException('host must not be empty');
    }

    if (!conversationId) {
      throw new BadRequestException('conversation_id must not be empty');
    }

    await this.queueService.enqueue({
      chat,
      conversation_id: conversationId,
      contact,
      direction,
      host,
      message,
    });

    this.metricsService.recordAcceptedConversation();
    await this.metricsService.refreshQueueDepth();

    return {
      status: 'accepted',
    };
  }
}
