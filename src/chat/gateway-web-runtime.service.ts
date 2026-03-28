import { Injectable } from '@nestjs/common';
import type { ConversationState } from '../contracts/assistant-memory';
import { GatewayWebConfigService } from './gateway-web-config.service';

export interface GatewayWebConversationMessage {
  content: string;
  created_at: string;
  role: 'assistant' | 'user';
}

export interface GatewayWebConversationState {
  conversation_id: string;
  messages: GatewayWebConversationMessage[];
  updated_at: string | null;
  user_id: string;
}

@Injectable()
export class GatewayWebRuntimeService {
  constructor(private readonly gatewayWebConfigService: GatewayWebConfigService) {}

  async readConversation(
    userId: string,
    conversationId: string,
  ): Promise<GatewayWebConversationState> {
    const response = await this.fetchMemoryEndpoint('/v1/conversations/read', {
      chat: 'direct',
      contact: userId,
      conversation_id: conversationId,
      direction: 'api',
    });

    if (!response.ok) {
      return this.emptyConversation(userId, conversationId);
    }

    const payload = (await response.json()) as ConversationState;

    return {
      conversation_id: conversationId,
      messages: payload.messages,
      updated_at: payload.updated_at,
      user_id: userId,
    };
  }

  clearConversation(
    userId: string,
    conversationId: string,
  ): GatewayWebConversationState {
    return this.emptyConversation(userId, conversationId);
  }

  private emptyConversation(
    userId: string,
    conversationId: string,
  ): GatewayWebConversationState {
    return {
      conversation_id: conversationId,
      messages: [],
      updated_at: null,
      user_id: userId,
    };
  }

  private async fetchMemoryEndpoint(path: string, body: unknown): Promise<Response> {
    const config = await this.gatewayWebConfigService.read();
    const baseUrl = config.assistant_memory_url.endsWith('/')
      ? config.assistant_memory_url.slice(0, -1)
      : config.assistant_memory_url;

    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    }).catch(() =>
      new Response(JSON.stringify({ message: 'assistant-memory unavailable' }), {
        headers: {
          'content-type': 'application/json',
        },
        status: 503,
      }),
    );
  }
}
