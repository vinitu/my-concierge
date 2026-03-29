import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GatewayEmailMetricsService } from './observability/gateway-email-metrics.service';

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

@Injectable()
export class GatewayEmailAssistantApiClientService {
  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: GatewayEmailMetricsService,
  ) {}

  async sendConversation(input: {
    conversationId: string;
    mailbox: string;
    message: string;
    userId: string;
  }): Promise<void> {
    const assistantApiUrl = trimTrailingSlash(
      this.configService.get<string>('ASSISTANT_API_URL', 'http://localhost:3000'),
    );
    const url = `${assistantApiUrl}/conversation/email/${encodeURIComponent(input.mailbox)}/${encodeURIComponent(input.userId)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        conversation_id: input.conversationId,
        message: input.message,
      }),
    });
    this.metricsService.recordUpstreamRequest('assistant-api', response.ok);

    if (!response.ok) {
      throw new Error(`assistant-api returned ${response.status}`);
    }
  }
}
