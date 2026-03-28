import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { GatewayEmailConfigService } from './gateway-email-config.service';
import type {
  GatewayEmailInboundMessage,
  GatewayEmailSendReplyResult,
} from './gateway-email-transport';

export interface GatewayEmailThreadMessage {
  direction: 'inbound' | 'outbound';
  from: string;
  id: string;
  in_reply_to: string | null;
  message_id: string;
  received_at: string;
  references: string[];
  subject: string;
  text: string;
  to: string[];
  transport_uid: number | null;
}

export interface GatewayEmailThread {
  contact: string;
  conversation_id: string;
  last_message_at: string | null;
  mailbox: string;
  message_ids: string[];
  participants: string[];
  subject: string;
}

interface GatewayEmailState {
  last_sync_completed_at: string | null;
  last_sync_started_at: string | null;
  last_seen_uid: number | null;
  messages: GatewayEmailThreadMessage[];
  threads: GatewayEmailThread[];
}

export interface GatewayEmailSyncState {
  last_sync_completed_at: string | null;
  last_sync_started_at: string | null;
  last_seen_uid: number | null;
}

const EMPTY_STATE: GatewayEmailState = {
  last_sync_completed_at: null,
  last_sync_started_at: null,
  last_seen_uid: null,
  messages: [],
  threads: [],
};

@Injectable()
export class GatewayEmailRuntimeService {
  constructor(private readonly gatewayEmailConfigService: GatewayEmailConfigService) {}

  async readState(): Promise<GatewayEmailState> {
    try {
      const raw = await readFile(this.statePath(), 'utf8');
      return this.normalizeState(JSON.parse(raw) as Partial<GatewayEmailState>);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return { ...EMPTY_STATE, messages: [], threads: [] };
      }

      throw error;
    }
  }

  async listThreads(): Promise<GatewayEmailThread[]> {
    const state = await this.readState();
    return state.threads
      .slice()
      .sort((left, right) => (right.last_message_at ?? '').localeCompare(left.last_message_at ?? ''));
  }

  async getThread(
    conversationId: string,
  ): Promise<{ messages: GatewayEmailThreadMessage[]; thread: GatewayEmailThread | null }> {
    const state = await this.readState();
    const thread = state.threads.find((candidate) => candidate.conversation_id === conversationId) ?? null;

    return {
      messages: state.messages
        .filter((message) => thread?.message_ids.includes(message.id) ?? false)
        .sort((left, right) => left.received_at.localeCompare(right.received_at)),
      thread,
    };
  }

  async ingestInbound(
    mailbox: string,
    message: GatewayEmailInboundMessage,
  ): Promise<{ conversation_id: string; duplicate: boolean; thread: GatewayEmailThread }> {
    const state = await this.readState();
    const duplicate = state.messages.some((candidate) => candidate.message_id === message.message_id);

    if (duplicate) {
      const thread = this.threadForMessageId(state, message.message_id);
      return {
        conversation_id: thread?.conversation_id ?? '',
        duplicate: true,
        thread: thread ?? this.createThread(mailbox, message.from, message.subject, ''),
      };
    }

    const conversationId = this.resolveConversationId(state, message);
    const normalized: GatewayEmailThreadMessage = {
      direction: 'inbound',
      from: message.from,
      id: `msg_${randomUUID()}`,
      in_reply_to: message.in_reply_to,
      message_id: message.message_id,
      received_at: message.received_at,
      references: message.references,
      subject: message.subject,
      text: message.text,
      to: message.to,
      transport_uid: message.transport_uid,
    };
    state.messages.push(normalized);
    const thread = this.upsertThread(
      state,
      mailbox,
      message.from,
      conversationId,
      normalized.id,
      message.subject,
      [message.from, ...message.to],
      message.received_at,
    );
    await this.writeState(state);

    return {
      conversation_id: conversationId,
      duplicate: false,
      thread,
    };
  }

  async appendOutbound(
    conversationId: string,
    message: string,
    result: GatewayEmailSendReplyResult,
    to: string,
    subject: string,
    inReplyTo: string | null,
    references: string[],
  ): Promise<void> {
    const state = await this.readState();
    const thread = state.threads.find((candidate) => candidate.conversation_id === conversationId);

    if (!thread) {
      return;
    }

    const runtimeMessage: GatewayEmailThreadMessage = {
      direction: 'outbound',
      from: thread.contact,
      id: `msg_${randomUUID()}`,
      in_reply_to: inReplyTo,
      message_id: result.message_id,
      received_at: result.accepted_at,
      references,
      subject,
      text: message,
      to: [to],
      transport_uid: null,
    };
    state.messages.push(runtimeMessage);
    this.upsertThread(
      state,
      thread.mailbox,
      thread.contact,
      conversationId,
      runtimeMessage.id,
      subject,
      [thread.contact, to],
      result.accepted_at,
    );
    await this.writeState(state);
  }

  async prepareReply(conversationId: string): Promise<{
    in_reply_to: string | null;
    references: string[];
    subject: string;
    to: string | null;
  }> {
    const { messages, thread } = await this.getThread(conversationId);

    if (!thread) {
      return {
        in_reply_to: null,
        references: [],
        subject: 'Re: MyConcierge',
        to: null,
      };
    }

    const lastInbound =
      messages
        .slice()
        .reverse()
        .find((message) => message.direction === 'inbound') ?? messages[messages.length - 1] ?? null;
    const subject = this.replySubject(lastInbound?.subject ?? thread.subject);
    const references = Array.from(
      new Set(
        messages
          .map((message) => message.message_id)
          .filter((value) => value.length > 0),
      ),
    );

    return {
      in_reply_to: lastInbound?.message_id ?? null,
      references,
      subject,
      to: lastInbound?.from ?? thread.contact,
    };
  }

  async markSyncStarted(): Promise<GatewayEmailSyncState> {
    const state = await this.readState();
    state.last_sync_started_at = new Date().toISOString();
    await this.writeState(state);
    return this.syncState(state);
  }

  async markSyncCompleted(lastSeenUid: number | null): Promise<GatewayEmailSyncState> {
    const state = await this.readState();
    state.last_seen_uid =
      typeof lastSeenUid === 'number' && Number.isFinite(lastSeenUid)
        ? Math.max(lastSeenUid, state.last_seen_uid ?? 0)
        : state.last_seen_uid;
    state.last_sync_completed_at = new Date().toISOString();
    await this.writeState(state);
    return this.syncState(state);
  }

  private resolveConversationId(
    state: GatewayEmailState,
    message: GatewayEmailInboundMessage,
  ): string {
    const candidateIds = [
      message.in_reply_to,
      ...message.references,
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);

    for (const messageId of candidateIds) {
      const thread = this.threadForMessageId(state, messageId);
      if (thread) {
        return thread.conversation_id;
      }
    }

    return `email_${randomUUID()}`;
  }

  private threadForMessageId(
    state: GatewayEmailState,
    messageId: string,
  ): GatewayEmailThread | null {
    const runtimeMessage = state.messages.find((candidate) => candidate.message_id === messageId);
    if (!runtimeMessage) {
      return null;
    }

    return (
      state.threads.find((thread) => thread.message_ids.includes(runtimeMessage.id)) ?? null
    );
  }

  private upsertThread(
    state: GatewayEmailState,
    mailbox: string,
    contact: string,
    conversationId: string,
    runtimeMessageId: string,
    subject: string,
    participants: string[],
    receivedAt: string,
  ): GatewayEmailThread {
    const existing = state.threads.find((candidate) => candidate.conversation_id === conversationId);

    if (existing) {
      existing.last_message_at = receivedAt;
      existing.subject = subject || existing.subject;
      existing.participants = Array.from(new Set([...existing.participants, ...participants])).sort();
      existing.message_ids = Array.from(new Set([...existing.message_ids, runtimeMessageId]));
      existing.contact = contact || existing.contact;
      return existing;
    }

    const next = this.createThread(mailbox, contact, subject, conversationId);
    next.last_message_at = receivedAt;
    next.message_ids = [runtimeMessageId];
    next.participants = Array.from(new Set(participants)).sort();
    state.threads.push(next);
    return next;
  }

  private createThread(
    mailbox: string,
    contact: string,
    subject: string,
    conversationId: string,
  ): GatewayEmailThread {
    return {
      contact,
      conversation_id: conversationId,
      last_message_at: null,
      mailbox,
      message_ids: [],
      participants: contact ? [contact] : [],
      subject,
    };
  }

  private syncState(state: GatewayEmailState): GatewayEmailSyncState {
    return {
      last_seen_uid: state.last_seen_uid,
      last_sync_completed_at: state.last_sync_completed_at,
      last_sync_started_at: state.last_sync_started_at,
    };
  }

  private replySubject(subject: string): string {
    return /^re:/i.test(subject) ? subject : `Re: ${subject || 'MyConcierge'}`;
  }

  private async writeState(state: GatewayEmailState): Promise<void> {
    await mkdir(dirname(this.statePath()), { recursive: true });
    await writeFile(this.statePath(), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }

  private statePath(): string {
    return join(this.gatewayEmailConfigService.runtimeDirectory(), 'mailbox', 'state.json');
  }

  private normalizeState(state: Partial<GatewayEmailState>): GatewayEmailState {
    return {
      last_sync_completed_at:
        typeof state.last_sync_completed_at === 'string' ? state.last_sync_completed_at : null,
      last_sync_started_at:
        typeof state.last_sync_started_at === 'string' ? state.last_sync_started_at : null,
      last_seen_uid:
        typeof state.last_seen_uid === 'number' && Number.isFinite(state.last_seen_uid)
          ? state.last_seen_uid
          : null,
      messages: Array.isArray(state.messages) ? state.messages : [],
      threads: Array.isArray(state.threads) ? state.threads : [],
    };
  }
}
