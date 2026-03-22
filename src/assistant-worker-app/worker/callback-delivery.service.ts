import { Injectable } from '@nestjs/common';

@Injectable()
export class CallbackDeliveryService {
  async sendResponse(
    host: string,
    conversationId: string,
    message: string,
  ): Promise<void> {
    const response = await fetch(
      this.callbackUrl(host, 'response', conversationId),
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ message }),
      },
    );

    if (!response.ok) {
      throw new Error(`callback returned ${response.status}`);
    }
  }

  async sendThinking(
    host: string,
    conversationId: string,
    seconds: number,
  ): Promise<void> {
    const response = await fetch(
      this.callbackUrl(host, 'thinking', conversationId),
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ seconds }),
      },
    );

    if (!response.ok) {
      throw new Error(`callback returned ${response.status}`);
    }
  }

  private callbackUrl(
    host: string,
    kind: 'response' | 'thinking',
    conversationId: string,
  ): string {
    const normalizedHost = host.endsWith('/') ? host.slice(0, -1) : host;
    return `${normalizedHost}/${kind}/${encodeURIComponent(conversationId)}`;
  }
}
