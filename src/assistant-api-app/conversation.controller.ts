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
  callback_url?: string;
  message?: string;
}

@Controller()
export class ConversationController {
  constructor(
    private readonly metricsService: AssistantApiMetricsService,
    private readonly queueService: QueueService,
  ) {}

  @Post('conversation/:direction/:chat/:contact')
  @HttpCode(200)
  async acceptConversation(
    @Param('direction') direction: string,
    @Param('chat') chat: string,
    @Param('contact') contact: string,
    @Body() body: ConversationBody,
  ): Promise<{ response: string }> {
    const message = body.message?.trim() ?? '';
    const callbackUrl = body.callback_url?.trim() ?? '';

    if (!message) {
      throw new BadRequestException('message must not be empty');
    }

    if (!callbackUrl) {
      throw new BadRequestException('callback_url must not be empty');
    }

    await this.queueService.enqueue({
      callback_url: callbackUrl,
      chat,
      contact,
      direction,
      message,
    });

    this.metricsService.recordAcceptedConversation();
    await this.metricsService.refreshQueueDepth();

    return {
      response: 'Message accepted',
    };
  }
}
