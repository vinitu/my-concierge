import { Injectable } from '@nestjs/common';
import type { RunEvent } from '../../contracts/assistant-transport';

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

@Injectable()
export class CallbackDeliveryService {
  async deliver(event: RunEvent): Promise<boolean> {
    if (event.eventType === 'run.started') {
      return true;
    }

    if (event.eventType === 'run.thinking') {
      return this.send(
        this.callbackUrl(event.callback.base_url, 'thinking', event.conversationId),
        { seconds: Number(event.payload.seconds ?? 1) },
      );
    }

    const message =
      typeof event.payload.message === 'string' && event.payload.message.trim().length > 0
        ? event.payload.message
        : event.eventType === 'run.failed'
          ? 'The assistant run failed.'
          : '';

    return this.send(
      this.callbackUrl(event.callback.base_url, 'response', event.conversationId),
      { message },
    );
  }

  private async send(url: string, body: Record<string, unknown>): Promise<boolean> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    return response.ok;
  }

  private callbackUrl(
    baseUrl: string,
    kind: 'response' | 'thinking',
    conversationId: string,
  ): string {
    return `${trimTrailingSlash(baseUrl)}/${kind}/${encodeURIComponent(conversationId)}`;
  }
}
