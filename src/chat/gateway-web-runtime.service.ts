import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface GatewayWebConversationMessage {
  content: string;
  created_at: string;
  role: 'assistant' | 'user';
}

export interface GatewayWebConversationState {
  messages: GatewayWebConversationMessage[];
  session_id: string;
  updated_at: string | null;
}

const MAX_GATEWAY_WEB_MESSAGES = 100;

@Injectable()
export class GatewayWebRuntimeService {
  constructor(private readonly configService: ConfigService) {}

  async readConversation(sessionId: string): Promise<GatewayWebConversationState> {
    const path = this.conversationPath(sessionId);

    try {
      const content = await readFile(path, 'utf8');
      return this.normalizeState(sessionId, JSON.parse(content) as Partial<GatewayWebConversationState>);
    } catch (error) {
      if (!this.isMissingPath(error)) {
        throw error;
      }

      return this.emptyState(sessionId);
    }
  }

  async appendUserMessage(sessionId: string, message: string): Promise<GatewayWebConversationState> {
    return this.appendMessage(sessionId, 'user', message);
  }

  async appendAssistantMessage(
    sessionId: string,
    message: string,
  ): Promise<GatewayWebConversationState> {
    return this.appendMessage(sessionId, 'assistant', message);
  }

  async clearConversation(sessionId: string): Promise<GatewayWebConversationState> {
    const nextState = this.emptyState(sessionId);

    await mkdir(dirname(this.conversationPath(sessionId)), { recursive: true });
    await writeFile(
      this.conversationPath(sessionId),
      `${JSON.stringify(nextState, null, 2)}\n`,
      'utf8',
    );

    return nextState;
  }

  conversationPath(sessionId: string): string {
    return join(this.runtimeDirectory(), 'conversations', `${sessionId}.json`);
  }

  private async appendMessage(
    sessionId: string,
    role: GatewayWebConversationMessage['role'],
    content: string,
  ): Promise<GatewayWebConversationState> {
    const trimmed = content.trim();
    const currentState = await this.readConversation(sessionId);
    const nextState: GatewayWebConversationState = {
      messages: [
        ...currentState.messages,
        {
          content: trimmed,
          created_at: new Date().toISOString(),
          role,
        },
      ].slice(-MAX_GATEWAY_WEB_MESSAGES),
      session_id: sessionId,
      updated_at: new Date().toISOString(),
    };

    await mkdir(dirname(this.conversationPath(sessionId)), { recursive: true });
    await writeFile(this.conversationPath(sessionId), `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');

    return nextState;
  }

  private runtimeDirectory(): string {
    return this.configService.get<string>(
      'GATEWAY_WEB_RUNTIME_DIR',
      join(process.cwd(), 'runtime', 'gateway-web'),
    );
  }

  private emptyState(sessionId: string): GatewayWebConversationState {
    return {
      messages: [],
      session_id: sessionId,
      updated_at: null,
    };
  }

  private normalizeState(
    sessionId: string,
    state: Partial<GatewayWebConversationState>,
  ): GatewayWebConversationState {
    const normalizedMessages = Array.isArray(state.messages)
      ? state.messages.filter(
          (entry): entry is GatewayWebConversationMessage =>
            typeof entry === 'object' &&
            entry !== null &&
            (entry.role === 'user' || entry.role === 'assistant') &&
            typeof entry.content === 'string' &&
            typeof entry.created_at === 'string',
        )
      : [];

    return {
      messages: normalizedMessages.slice(-MAX_GATEWAY_WEB_MESSAGES),
      session_id:
        typeof state.session_id === 'string' && state.session_id ? state.session_id : sessionId,
      updated_at: typeof state.updated_at === 'string' ? state.updated_at : null,
    };
  }

  private isMissingPath(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    );
  }
}
