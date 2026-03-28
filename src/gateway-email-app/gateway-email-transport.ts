export interface GatewayEmailConfig {
  email: string;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  password: string;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  sync_delay_seconds: number;
  updated_at: string | null;
}

export interface GatewayEmailInboundMessage {
  from: string;
  in_reply_to: string | null;
  message_id: string;
  received_at: string;
  references: string[];
  subject: string;
  text: string;
  to: string[];
  transport_uid: number | null;
}

export interface GatewayEmailSendReplyInput {
  in_reply_to: string | null;
  references: string[];
  subject: string;
  text: string;
  to: string;
}

export interface GatewayEmailSendReplyResult {
  accepted_at: string;
  message_id: string;
}

export interface GatewayEmailSyncResult {
  last_seen_uid: number | null;
  messages: GatewayEmailInboundMessage[];
}

export interface GatewayEmailTransport {
  sendReply(
    config: GatewayEmailConfig,
    input: GatewayEmailSendReplyInput,
  ): Promise<GatewayEmailSendReplyResult>;
  syncInbox(
    config: GatewayEmailConfig,
    lastSeenUid: number | null,
  ): Promise<GatewayEmailSyncResult>;
}

export const GATEWAY_EMAIL_TRANSPORT = Symbol('GATEWAY_EMAIL_TRANSPORT');
