import { Injectable } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import {
  simpleParser,
  type AddressObject,
  type ParsedMail,
} from 'mailparser';
import nodemailer from 'nodemailer';
import type {
  GatewayEmailConfig,
  GatewayEmailSendReplyInput,
  GatewayEmailSendReplyResult,
  GatewayEmailSyncResult,
  GatewayEmailTransport,
} from './gateway-email-transport';

@Injectable()
export class GatewayEmailImapSmtpService implements GatewayEmailTransport {
  private addresses(input: AddressObject | AddressObject[] | undefined): string[] {
    if (Array.isArray(input)) {
      return input.flatMap((entry) => this.addresses(entry));
    }

    return (
      input?.value
        ?.map((entry: { address?: string }) => entry.address ?? '')
        .filter((value: string) => value.length > 0) ?? []
    );
  }

  async syncInbox(
    config: GatewayEmailConfig,
    lastSeenUid: number | null,
  ): Promise<GatewayEmailSyncResult> {
    const client = new ImapFlow({
      auth: {
        pass: config.password,
        user: config.email,
      },
      host: config.imap_host,
      port: config.imap_port,
      secure: config.imap_secure,
    });
    let highestUid = lastSeenUid;

    await client.connect();

    try {
      await client.mailboxOpen('INBOX');
      const startUid =
        typeof lastSeenUid === 'number' && Number.isFinite(lastSeenUid) ? lastSeenUid + 1 : 1;
      const messages = [];

      for await (const message of client.fetch(`${String(startUid)}:*`, {
        envelope: true,
        source: true,
        uid: true,
      })) {
        const parsed = (await simpleParser(
          message.source ?? Buffer.from('', 'utf8'),
        )) as ParsedMail;
        const from =
          this.addresses(parsed.from)[0] ??
          message.envelope?.from?.[0]?.address ??
          '';
        const toAddresses = this.addresses(parsed.to).length > 0
          ? this.addresses(parsed.to)
          : message.envelope?.to
              ?.map((entry) => entry.address ?? '')
              .filter((value): value is string => value.length > 0) ?? [];
        const referencesHeader = parsed.references
          ? Array.isArray(parsed.references)
            ? parsed.references
            : [parsed.references]
          : [];
        const normalized = {
          from,
          in_reply_to: parsed.inReplyTo ?? null,
          message_id: parsed.messageId ?? `<${String(message.uid)}@gateway-email.local>`,
          received_at:
            parsed.date?.toISOString() ??
            message.envelope?.date?.toISOString() ??
            new Date().toISOString(),
          references: referencesHeader.filter(
            (value: unknown): value is string =>
              typeof value === 'string' && value.length > 0,
          ),
          subject: parsed.subject ?? message.envelope?.subject ?? '(no subject)',
          text: parsed.text?.trim() ?? '',
          to: toAddresses,
          transport_uid: message.uid ?? null,
        };
        messages.push(normalized);
        highestUid =
          typeof message.uid === 'number' && Number.isFinite(message.uid)
            ? Math.max(highestUid ?? 0, message.uid)
            : highestUid;
      }

      return {
        last_seen_uid: highestUid ?? null,
        messages,
      };
    } finally {
      await client.logout();
    }
  }

  async sendReply(
    config: GatewayEmailConfig,
    input: GatewayEmailSendReplyInput,
  ): Promise<GatewayEmailSendReplyResult> {
    const transport = nodemailer.createTransport({
      auth: {
        pass: config.password,
        user: config.email,
      },
      host: config.smtp_host,
      port: config.smtp_port,
      secure: config.smtp_secure,
    });
    const result = await transport.sendMail({
      from: config.email,
      inReplyTo: input.in_reply_to ?? undefined,
      references: input.references.length > 0 ? input.references.join(' ') : undefined,
      subject: input.subject,
      text: input.text,
      to: input.to,
    });

    return {
      accepted_at: new Date().toISOString(),
      message_id: result.messageId,
    };
  }
}
