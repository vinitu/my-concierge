import { Injectable } from '@nestjs/common';
import type {
  GatewayTelegramConfig,
  GatewayTelegramSendMessageInput,
  GatewayTelegramSendMessageResult,
  GatewayTelegramTransport,
} from './gateway-telegram-transport';

interface TelegramSendMessageResponse {
  ok?: boolean;
  result?: {
    message_id?: number;
  };
}

@Injectable()
export class GatewayTelegramBotApiService implements GatewayTelegramTransport {
  async sendMessage(
    config: GatewayTelegramConfig,
    input: GatewayTelegramSendMessageInput,
  ): Promise<GatewayTelegramSendMessageResult> {
    const token = config.bot_token.trim();

    if (!token) {
      throw new Error('Telegram bot token is not configured');
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      body: JSON.stringify({
        chat_id: input.chat_id,
        message_thread_id: input.message_thread_id ?? undefined,
        reply_to_message_id: input.reply_to_message_id ?? undefined,
        text: input.text,
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Telegram API returned ${response.status}`);
    }

    const payload = (await response.json()) as TelegramSendMessageResponse;
    const messageId = payload.result?.message_id;

    if (typeof messageId !== 'number') {
      throw new Error('Telegram API response did not include message_id');
    }

    return {
      message_id: messageId,
      sent_at: new Date().toISOString(),
    };
  }
}
