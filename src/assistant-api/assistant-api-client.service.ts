import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../observability/metrics.service';

interface ConversationRequest {
  conversationId: string;
  message: string;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

@Injectable()
export class AssistantApiClientService {
  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {}

  async sendConversation(request: ConversationRequest): Promise<void> {
    const assistantApiUrl = trimTrailingSlash(
      this.configService.get<string>('ASSISTANT_API_URL', 'http://localhost:3000'),
    );
    const callbackBaseUrl = trimTrailingSlash(
      this.configService.get<string>('CALLBACK_BASE_URL', 'http://localhost:3000'),
    );
    const url = `${assistantApiUrl}/conversation/api/direct/${encodeURIComponent(request.conversationId)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        conversation_id: request.conversationId,
        host: callbackBaseUrl,
        message: request.message,
      }),
    });

    this.metricsService.recordAssistantApiRequest(response.ok);

    if (!response.ok) {
      throw new Error(`assistant-api returned ${response.status}`);
    }
  }
}
