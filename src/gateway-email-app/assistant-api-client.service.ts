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
    contact: string;
    conversationId: string;
    mailbox: string;
    message: string;
  }): Promise<void> {
    const assistantApiUrl = trimTrailingSlash(
      this.configService.get<string>('ASSISTANT_API_URL', 'http://localhost:3000'),
    );
    const callbackBaseUrl = trimTrailingSlash(
      this.configService.get<string>('CALLBACK_BASE_URL', 'http://localhost:3004'),
    );
    const url = `${assistantApiUrl}/conversation/email/${encodeURIComponent(input.mailbox)}/${encodeURIComponent(input.contact)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        callback: {
          base_url: callbackBaseUrl,
        },
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
