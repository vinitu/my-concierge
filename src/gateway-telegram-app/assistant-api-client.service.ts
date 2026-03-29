import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GatewayTelegramMetricsService } from './observability/gateway-telegram-metrics.service';

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

@Injectable()
export class GatewayTelegramAssistantApiClientService {
  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: GatewayTelegramMetricsService,
  ) {}

  async sendConversation(input: {
    chat: string;
    conversationId: string;
    message: string;
    userId: string;
  }): Promise<void> {
    const assistantApiUrl = trimTrailingSlash(
      this.configService.get<string>('ASSISTANT_API_URL', 'http://localhost:3000'),
    );
    const url = `${assistantApiUrl}/conversation/telegram/${encodeURIComponent(input.chat)}/${encodeURIComponent(input.userId)}`;

    const response = await fetch(url, {
      body: JSON.stringify({
        conversation_id: input.conversationId,
        message: input.message,
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    });
    this.metricsService.recordUpstreamRequest('assistant-api', response.ok);

    if (!response.ok) {
      throw new Error(`assistant-api returned ${response.status}`);
    }
  }
}
