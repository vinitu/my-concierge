export interface GatewayTelegramConfig {
  bot_token: string;
  updated_at: string | null;
}

export interface GatewayTelegramInboundMessage {
  chat_id: string;
  from_id: string;
  from_username: string | null;
  message_id: number;
  message_thread_id: number | null;
  received_at: string;
  text: string;
}

export interface GatewayTelegramSendMessageInput {
  chat_id: string;
  message_thread_id: number | null;
  reply_to_message_id: number | null;
  text: string;
}

export interface GatewayTelegramSendMessageResult {
  message_id: number;
  sent_at: string;
}

export interface GatewayTelegramTransport {
  sendMessage(
    config: GatewayTelegramConfig,
    input: GatewayTelegramSendMessageInput,
  ): Promise<GatewayTelegramSendMessageResult>;
}

export const GATEWAY_TELEGRAM_TRANSPORT = Symbol('GATEWAY_TELEGRAM_TRANSPORT');
