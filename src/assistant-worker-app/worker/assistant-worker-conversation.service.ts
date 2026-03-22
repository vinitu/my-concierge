import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { QueueMessage } from '../../assistant-api-app/queue/queue-adapter';
import type { AssistantLlmGenerateResult } from './assistant-llm-response-parser';
import { AssistantWorkerConfigService } from './assistant-worker-config.service';

export interface AssistantConversationMessage {
  content: string;
  created_at: string;
  role: 'assistant' | 'user';
}

export interface AssistantConversationState {
  chat: string;
  contact: string;
  context: string;
  direction: string;
  messages: AssistantConversationMessage[];
  updated_at: string | null;
}

@Injectable()
export class AssistantWorkerConversationService {
  constructor(
    private readonly assistantWorkerConfigService: AssistantWorkerConfigService,
    private readonly configService: ConfigService,
  ) {}

  async read(message: QueueMessage): Promise<AssistantConversationState> {
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

  async appendExchange(
    message: QueueMessage,
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
      contact: message.contact,
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

  conversationPath(message: QueueMessage): string {
    return join(
      this.datadir(),
      'conversations',
      message.direction,
      message.chat,
      `${message.contact}.json`,
    );
  }

  private datadir(): string {
    return this.configService.get<string>(
      'ASSISTANT_DATADIR',
      join(process.cwd(), 'runtime', 'assistant-worker'),
    );
  }

  private emptyState(message: QueueMessage): AssistantConversationState {
    return {
      chat: message.chat,
      contact: message.contact,
      context: '',
      direction: message.direction,
      messages: [],
      updated_at: null,
    };
  }

  private normalizeState(
    message: QueueMessage,
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
      contact:
        typeof state.contact === 'string' && state.contact ? state.contact : message.contact,
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
    const config = await this.assistantWorkerConfigService.read();
    return config.memory_window;
  }
}
