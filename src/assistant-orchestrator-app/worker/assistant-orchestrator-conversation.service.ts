import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  ConversationThreadListResponse,
  ConversationSearchResponse,
  ConversationState,
} from '../../contracts/assistant-memory';
import type { ExecutionJob } from '../../contracts/assistant-transport';
import type { AssistantLlmGenerateResult } from './assistant-llm-output-schema';
import { AssistantOrchestratorConfigService } from './assistant-orchestrator-config.service';

export interface AssistantConversationMessage {
  content: string;
  created_at: string;
  role: 'assistant' | 'user';
}

export interface AssistantConversationState {
  chat: string;
  user_id: string;
  context: string;
  direction: string;
  messages: AssistantConversationMessage[];
  updated_at: string | null;
}

export interface AssistantConversationSearchResult {
  messages: AssistantConversationMessage[];
  thread_id: string;
  summary: string;
}

export interface AssistantConversationThreadListItem {
  chat: string;
  user_id: string;
  direction: string;
  thread_id: string;
  updated_at: string | null;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

@Injectable()
export class AssistantOrchestratorConversationService {
  private readonly logger = new Logger(AssistantOrchestratorConversationService.name);

  constructor(
    private readonly assistantOrchestratorConfigService: AssistantOrchestratorConfigService,
    private readonly configService: ConfigService,
  ) {}

  async read(message: ExecutionJob): Promise<AssistantConversationState> {
    this.logger.log(
      `Conversation read start conversationId=${message.conversation_id} driver=${this.storeDriver()}`,
    );
    if (this.storeDriver() === 'file') {
      return this.readFromFile(message);
    }

    return this.readFromMysql(message);
  }

  async appendExchange(
    message: ExecutionJob,
    reply: AssistantLlmGenerateResult,
    requestId?: string,
  ): Promise<AssistantConversationState> {
    if (this.storeDriver() === 'file') {
      return this.appendExchangeToFile(message, reply);
    }

    return this.appendExchangeToMysql(message, reply, requestId);
  }

  async searchThread(
    conversationId: string,
    limit: number,
  ): Promise<AssistantConversationSearchResult> {
    if (this.storeDriver() === 'file') {
      throw new Error('memory_conversation_search is not available in file mode');
    }

    const response = await this.fetchMemoryEndpoint('/v1/conversations/search', {
      conversation_id: conversationId,
      limit: Math.max(1, Math.min(20, Math.floor(limit))),
    });
    const payload = (await response.json()) as ConversationSearchResponse;

    return payload;
  }

  async listConversations(): Promise<AssistantConversationThreadListItem[]> {
    if (this.storeDriver() === 'file') {
      return [];
    }

    const baseUrl = trimTrailingSlash(
      this.configService.get<string>('ASSISTANT_MEMORY_URL', 'http://localhost:3002'),
    );
    const response = await fetch(`${baseUrl}/v1/conversations`);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`assistant-memory returned ${response.status} for /v1/conversations: ${body}`);
    }

    const payload = (await response.json()) as ConversationThreadListResponse;
    return payload.threads;
  }

  private async readFromFile(message: ExecutionJob): Promise<AssistantConversationState> {
    const path = this.conversationPath(message);

    try {
      const content = await readFile(path, 'utf8');
      return this.normalizeState(message, JSON.parse(content) as Partial<AssistantConversationState>);
    } catch (error) {
      if (!this.isMissingPath(error)) {
        throw error;
      }

      return this.emptyState(message);
    }
  }

  private async appendExchangeToFile(
    message: ExecutionJob,
    reply: AssistantLlmGenerateResult,
  ): Promise<AssistantConversationState> {
    const currentState = await this.read(message);
    const maxMessages = await this.memoryWindow();
    const nextMessages = [
      ...currentState.messages,
      this.createMessage('user', message.message),
      this.createMessage('assistant', reply.message),
    ];
    const messages = nextMessages.slice(-maxMessages);
    const nextContext = reply.context.trim() || currentState.context;
    const nextState: AssistantConversationState = {
      chat: message.chat,
      user_id: message.user_id || message.contact || 'default-user',
      context: nextContext,
      direction: message.direction,
      messages,
      updated_at: new Date().toISOString(),
    };

    await mkdir(dirname(this.conversationPath(message)), { recursive: true });
    await writeFile(
      this.conversationPath(message),
      `${JSON.stringify(nextState, null, 2)}\n`,
      'utf8',
    );

    return nextState;
  }

  private async readFromMysql(message: ExecutionJob): Promise<AssistantConversationState> {
    const userId = message.user_id?.trim() || message.contact?.trim() || 'default-user';
    const response = await this.fetchMemoryEndpoint('/v1/conversations/read', {
      chat: message.chat,
      user_id: userId,
      conversation_id: message.conversation_id,
      direction: message.direction,
    });

    const payload = (await response.json()) as ConversationState;
    const maxMessages = await this.memoryWindow();

    return {
      ...payload,
      messages: payload.messages.slice(-maxMessages),
    };
  }

  private async appendExchangeToMysql(
    message: ExecutionJob,
    reply: AssistantLlmGenerateResult,
    requestId?: string,
  ): Promise<AssistantConversationState> {
    const userId = message.user_id?.trim() || message.contact?.trim() || 'default-user';
    const response = await this.fetchMemoryEndpoint('/v1/conversations/append', {
      chat: message.chat,
      user_id: userId,
      conversation_id: message.conversation_id,
      direction: message.direction,
      message: message.message,
      reply: {
        context: reply.context,
        message: reply.message,
      },
      request_id: requestId,
    });

    const payload = (await response.json()) as ConversationState;
    const maxMessages = await this.memoryWindow();

    return {
      ...payload,
      messages: payload.messages.slice(-maxMessages),
    };
  }

  conversationPath(message: ExecutionJob): string {
    return join(
      this.datadir(),
      'conversations',
      message.direction,
      message.chat,
      `${message.user_id || message.contact || 'default-user'}.json`,
    );
  }

  private datadir(): string {
    return this.configService.get<string>(
      'ASSISTANT_DATADIR',
      join(process.cwd(), 'runtime', 'assistant-orchestrator'),
    );
  }

  private storeDriver(): 'file' | 'mysql' {
    const driver = this.configService.get<string>('ASSISTANT_CONVERSATION_STORE_DRIVER', 'mysql');
    return driver === 'file' ? 'file' : 'mysql';
  }

  private emptyState(message: ExecutionJob): AssistantConversationState {
    return {
      chat: message.chat,
      user_id: message.user_id || message.contact || 'default-user',
      context: '',
      direction: message.direction,
      messages: [],
      updated_at: null,
    };
  }

  private normalizeState(
    message: ExecutionJob,
    state: Partial<AssistantConversationState>,
  ): AssistantConversationState {
    const normalizedMessages = Array.isArray(state.messages)
      ? state.messages
          .filter(
            (entry): entry is AssistantConversationMessage =>
              typeof entry === 'object' &&
              entry !== null &&
              (entry.role === 'user' || entry.role === 'assistant') &&
              typeof entry.content === 'string' &&
              typeof entry.created_at === 'string',
          )
          .slice(-20)
      : [];

    return {
      chat: typeof state.chat === 'string' && state.chat ? state.chat : message.chat,
      user_id:
        typeof state.user_id === 'string' && state.user_id ? state.user_id : message.user_id || message.contact || 'default-user',
      context: typeof state.context === 'string' ? state.context : '',
      direction:
        typeof state.direction === 'string' && state.direction
          ? state.direction
          : message.direction,
      messages: normalizedMessages,
      updated_at: typeof state.updated_at === 'string' ? state.updated_at : null,
    };
  }

  private createMessage(
    role: AssistantConversationMessage['role'],
    content: string,
  ): AssistantConversationMessage {
    return {
      content,
      created_at: new Date().toISOString(),
      role,
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

  private async memoryWindow(): Promise<number> {
    const config = await this.assistantOrchestratorConfigService.read();
    return config.memory_window;
  }

  private async fetchMemoryEndpoint(path: string, body: unknown): Promise<Response> {
    const baseUrl = trimTrailingSlash(
      this.configService.get<string>('ASSISTANT_MEMORY_URL', 'http://localhost:3002'),
    );
    const response = await fetch(`${baseUrl}${path}`, {
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(
        `assistant-memory returned ${response.status} for ${path}: ${responseBody}`,
      );
    }

    return response;
  }

}
