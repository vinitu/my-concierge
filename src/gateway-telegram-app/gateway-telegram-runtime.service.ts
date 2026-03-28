import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { GatewayTelegramConfigService } from './gateway-telegram-config.service';
import type {
  GatewayTelegramInboundMessage,
  GatewayTelegramSendMessageResult,
} from './gateway-telegram-transport';

export interface GatewayTelegramThreadMessage {
  direction: 'inbound' | 'outbound';
  from: string;
  id: string;
  message_thread_id: number | null;
  received_at: string;
  reply_to_message_id: number | null;
  telegram_message_id: number;
  text: string;
}

export interface GatewayTelegramThread {
  chat_id: string;
  contact: string;
  conversation_id: string;
  last_message_at: string | null;
  message_ids: string[];
  message_thread_id: number | null;
}

interface GatewayTelegramState {
  messages: GatewayTelegramThreadMessage[];
  threads: GatewayTelegramThread[];
}

const EMPTY_STATE: GatewayTelegramState = {
  messages: [],
  threads: [],
};

@Injectable()
export class GatewayTelegramRuntimeService {
  constructor(
    private readonly gatewayTelegramConfigService: GatewayTelegramConfigService,
  ) {}

  async readState(): Promise<GatewayTelegramState> {
    try {
      const raw = await readFile(this.statePath(), 'utf8');
      return this.normalize(JSON.parse(raw) as Partial<GatewayTelegramState>);
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

  async listThreads(): Promise<GatewayTelegramThread[]> {
    const state = await this.readState();
    return state.threads
      .slice()
      .sort((left, right) =>
        (right.last_message_at ?? '').localeCompare(left.last_message_at ?? ''),
      );
  }

  async getThread(
    conversationId: string,
  ): Promise<{ messages: GatewayTelegramThreadMessage[]; thread: GatewayTelegramThread | null }> {
    const state = await this.readState();
    const thread =
      state.threads.find((candidate) => candidate.conversation_id === conversationId) ??
      null;

    return {
      messages: state.messages
        .filter((message) => thread?.message_ids.includes(message.id) ?? false)
        .sort((left, right) => left.received_at.localeCompare(right.received_at)),
      thread,
    };
  }

  async ingestInbound(
    message: GatewayTelegramInboundMessage,
  ): Promise<{ conversation_id: string; duplicate: boolean; thread: GatewayTelegramThread }> {
    const state = await this.readState();
    const duplicate = state.messages.some(
      (candidate) =>
        candidate.telegram_message_id === message.message_id &&
        this.threadOwnsChat(state, candidate.id, message.chat_id, message.message_thread_id),
    );

    if (duplicate) {
      const thread =
        state.threads.find(
          (candidate) =>
            candidate.chat_id === message.chat_id &&
            candidate.message_thread_id === message.message_thread_id,
        ) ?? this.createThread(message.chat_id, this.contact(message), '');

      return {
        conversation_id: thread.conversation_id,
        duplicate: true,
        thread,
      };
    }

    const conversationId = this.resolveConversationId(
      message.chat_id,
      message.message_thread_id,
    );
    const runtimeMessage: GatewayTelegramThreadMessage = {
      direction: 'inbound',
      from: this.contact(message),
      id: `msg_${randomUUID()}`,
      message_thread_id: message.message_thread_id,
      received_at: message.received_at,
      reply_to_message_id: null,
      telegram_message_id: message.message_id,
      text: message.text,
    };
    state.messages.push(runtimeMessage);
    const thread = this.upsertThread(
      state,
      conversationId,
      message.chat_id,
      this.contact(message),
      runtimeMessage.id,
      message.message_thread_id,
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
    text: string,
    result: GatewayTelegramSendMessageResult,
  ): Promise<void> {
    const state = await this.readState();
    const thread = state.threads.find(
      (candidate) => candidate.conversation_id === conversationId,
    );

    if (!thread) {
      return;
    }

    const lastMessage =
      state.messages
        .filter((message) => thread.message_ids.includes(message.id))
        .sort((left, right) => right.received_at.localeCompare(left.received_at))[0] ?? null;
    const runtimeMessage: GatewayTelegramThreadMessage = {
      direction: 'outbound',
      from: 'assistant',
      id: `msg_${randomUUID()}`,
      message_thread_id: thread.message_thread_id,
      received_at: result.sent_at,
      reply_to_message_id: lastMessage?.telegram_message_id ?? null,
      telegram_message_id: result.message_id,
      text,
    };
    state.messages.push(runtimeMessage);
    this.upsertThread(
      state,
      conversationId,
      thread.chat_id,
      thread.contact,
      runtimeMessage.id,
      thread.message_thread_id,
      result.sent_at,
    );
    await this.writeState(state);
  }

  async prepareReply(conversationId: string): Promise<{
    chat_id: string | null;
    message_thread_id: number | null;
    reply_to_message_id: number | null;
  }> {
    const { messages, thread } = await this.getThread(conversationId);

    if (!thread) {
      return {
        chat_id: null,
        message_thread_id: null,
        reply_to_message_id: null,
      };
    }

    const lastInbound =
      messages
        .slice()
        .reverse()
        .find((message) => message.direction === 'inbound') ??
      messages[messages.length - 1] ??
      null;

    return {
      chat_id: thread.chat_id,
      message_thread_id: thread.message_thread_id,
      reply_to_message_id: lastInbound?.telegram_message_id ?? null,
    };
  }

  private contact(message: GatewayTelegramInboundMessage): string {
    return message.from_username?.trim() || message.from_id;
  }

  private resolveConversationId(
    chatId: string,
    messageThreadId: number | null,
  ): string {
    return messageThreadId === null
      ? `tg_${chatId}`
      : `tg_${chatId}_${String(messageThreadId)}`;
  }

  private upsertThread(
    state: GatewayTelegramState,
    conversationId: string,
    chatId: string,
    contact: string,
    messageId: string,
    messageThreadId: number | null,
    receivedAt: string,
  ): GatewayTelegramThread {
    const existing =
      state.threads.find((candidate) => candidate.conversation_id === conversationId) ?? null;

    if (existing) {
      existing.chat_id = chatId;
      existing.contact = contact;
      existing.last_message_at = receivedAt;
      existing.message_thread_id = messageThreadId;
      if (!existing.message_ids.includes(messageId)) {
        existing.message_ids.push(messageId);
      }
      return existing;
    }

    const created = this.createThread(chatId, contact, conversationId, messageThreadId);
    created.last_message_at = receivedAt;
    created.message_ids = [messageId];
    state.threads.push(created);
    return created;
  }

  private createThread(
    chatId: string,
    contact: string,
    conversationId: string,
    messageThreadId: number | null = null,
  ): GatewayTelegramThread {
    return {
      chat_id: chatId,
      contact,
      conversation_id: conversationId,
      last_message_at: null,
      message_ids: [],
      message_thread_id: messageThreadId,
    };
  }

  private threadOwnsChat(
    state: GatewayTelegramState,
    messageId: string,
    chatId: string,
    messageThreadId: number | null,
  ): boolean {
    return state.threads.some(
      (thread) =>
        thread.message_ids.includes(messageId) &&
        thread.chat_id === chatId &&
        thread.message_thread_id === messageThreadId,
    );
  }

  private async writeState(state: GatewayTelegramState): Promise<void> {
    await mkdir(dirname(this.statePath()), { recursive: true });
    await writeFile(this.statePath(), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }

  private normalize(candidate: Partial<GatewayTelegramState>): GatewayTelegramState {
    return {
      messages: Array.isArray(candidate.messages)
        ? candidate.messages.map((message) => ({
            direction:
              message.direction === 'outbound' ? 'outbound' : 'inbound',
            from: typeof message.from === 'string' ? message.from : '',
            id: typeof message.id === 'string' ? message.id : `msg_${randomUUID()}`,
            message_thread_id:
              typeof message.message_thread_id === 'number'
                ? message.message_thread_id
                : null,
            received_at:
              typeof message.received_at === 'string'
                ? message.received_at
                : new Date(0).toISOString(),
            reply_to_message_id:
              typeof message.reply_to_message_id === 'number'
                ? message.reply_to_message_id
                : null,
            telegram_message_id:
              typeof message.telegram_message_id === 'number'
                ? message.telegram_message_id
                : 0,
            text: typeof message.text === 'string' ? message.text : '',
          }))
        : [],
      threads: Array.isArray(candidate.threads)
        ? candidate.threads.map((thread) => ({
            chat_id: typeof thread.chat_id === 'string' ? thread.chat_id : '',
            contact: typeof thread.contact === 'string' ? thread.contact : '',
            conversation_id:
              typeof thread.conversation_id === 'string'
                ? thread.conversation_id
                : `tg_${randomUUID()}`,
            last_message_at:
              typeof thread.last_message_at === 'string' ? thread.last_message_at : null,
            message_ids: Array.isArray(thread.message_ids)
              ? thread.message_ids.filter((value): value is string => typeof value === 'string')
              : [],
            message_thread_id:
              typeof thread.message_thread_id === 'number'
                ? thread.message_thread_id
                : null,
          }))
        : [],
    };
  }

  private statePath(): string {
    return join(
      this.gatewayTelegramConfigService.runtimeDirectory(),
      'conversations',
      'gateway-telegram-state.json',
    );
  }
}
