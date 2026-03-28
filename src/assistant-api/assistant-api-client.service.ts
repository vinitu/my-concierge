import { Injectable } from '@nestjs/common';
import { GatewayWebConfigService } from '../chat/gateway-web-config.service';
import { MetricsService } from '../observability/metrics.service';

interface ConversationRequest {
  conversationId: string;
  message: string;
  userId: string;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

@Injectable()
export class AssistantApiClientService {
  constructor(
    private readonly gatewayWebConfigService: GatewayWebConfigService,
    private readonly metricsService: MetricsService,
  ) {}

  async sendConversation(request: ConversationRequest): Promise<void> {
    const config = await this.gatewayWebConfigService.read();
    const assistantApiUrl = trimTrailingSlash(config.assistant_api_url);
    const callbackBaseUrl = trimTrailingSlash(config.callback_base_url);
    const url = `${assistantApiUrl}/conversation/api/direct/${encodeURIComponent(request.userId)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        callback: {
          base_url: callbackBaseUrl,
        },
        conversation_id: request.conversationId,
        message: request.message,
      }),
    });

    this.metricsService.recordAssistantApiRequest(response.ok);

    if (!response.ok) {
      throw new Error(`assistant-api returned ${response.status}`);
    }
  }
}
