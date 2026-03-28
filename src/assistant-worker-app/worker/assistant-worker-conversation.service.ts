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
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import type {
  PoolConnection,
  RowDataPacket,
} from 'mysql2/promise';
import type { ExecutionJob } from '../../contracts/assistant-transport';
import { MysqlService } from '../../persistence/mysql.service';
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

export interface AssistantConversationSearchResult {
  messages: AssistantConversationMessage[];
  thread_id: string;
  summary: string;
}

@Injectable()
export class AssistantWorkerConversationService {
  private readonly logger = new Logger(AssistantWorkerConversationService.name);
  private schemaReady = false;

  constructor(
    private readonly assistantWorkerConfigService: AssistantWorkerConfigService,
    private readonly configService: ConfigService,
    private readonly mysqlService: MysqlService,
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
    runId?: string,
  ): Promise<AssistantConversationState> {
    if (this.storeDriver() === 'file') {
      return this.appendExchangeToFile(message, reply);
    }

    return this.appendExchangeToMysql(message, reply, runId);
  }

  async searchThread(
    conversationId: string,
    limit: number,
  ): Promise<AssistantConversationSearchResult> {
    if (this.storeDriver() === 'file') {
      throw new Error('conversation_search is not available in file mode');
    }

    await this.assertMysqlSchemaReady();
    const pool = await this.mysqlService.getPool();
    const [summaryRows] = await pool.query<
      Array<RowDataPacket & { summary: string }>
    >(
      `
        SELECT summary
        FROM conversation_summaries
        WHERE thread_id = ?
        LIMIT 1
      `,
      [conversationId],
    );
    const [messageRows] = await pool.query<
      Array<RowDataPacket & { created_at: Date | string; message: string; role: 'assistant' | 'user' }>
    >(
      `
        SELECT role, message, created_at
        FROM conversation_turns
        WHERE thread_id = ?
        ORDER BY sequence_no DESC
        LIMIT ?
      `,
      [conversationId, Math.max(1, Math.min(20, Math.floor(limit)))],
    );

    return {
      messages: messageRows
        .slice()
        .reverse()
        .map((row) => ({
          content: row.message,
          created_at: this.toIsoString(row.created_at) ?? new Date().toISOString(),
          role: row.role,
        })),
      summary: summaryRows[0]?.summary ?? '',
      thread_id: conversationId,
    };
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

  private async readFromMysql(message: ExecutionJob): Promise<AssistantConversationState> {
    await this.assertMysqlSchemaReady();
    this.logger.log(`Conversation MySQL schema ready conversationId=${message.conversation_id}`);
    const pool = await this.mysqlService.getPool();
    const [threads] = await pool.query<
      Array<
        RowDataPacket & {
          chat: string;
          contact: string;
          direction: string;
          updated_at: Date | string | null;
        }
      >
    >(
      `
        SELECT chat, contact, direction, updated_at
        FROM conversation_threads
        WHERE id = ?
        LIMIT 1
      `,
      [message.conversation_id],
    );

    if (threads.length === 0) {
      this.logger.log(`Conversation thread missing conversationId=${message.conversation_id}`);
      return this.emptyState(message);
    }

    const [summaries] = await pool.query<
      Array<RowDataPacket & { summary: string }>
    >(
      `
        SELECT summary
        FROM conversation_summaries
        WHERE thread_id = ?
        LIMIT 1
      `,
      [message.conversation_id],
    );
    const maxMessages = await this.memoryWindow();
    const [turnRows] = await pool.query<
      Array<
        RowDataPacket & {
          created_at: Date | string;
          message: string;
          role: 'assistant' | 'user';
        }
      >
    >(
      `
        SELECT role, message, created_at
        FROM conversation_turns
        WHERE thread_id = ?
        ORDER BY sequence_no DESC
        LIMIT ?
      `,
      [message.conversation_id, maxMessages],
    );

    return {
      chat: threads[0].chat,
      contact: threads[0].contact,
      context: summaries[0]?.summary ?? '',
      direction: threads[0].direction,
      messages: turnRows
        .slice()
        .reverse()
        .map((row) => ({
          content: row.message,
          created_at: this.toIsoString(row.created_at) ?? new Date().toISOString(),
          role: row.role,
        })),
      updated_at: this.toIsoString(threads[0].updated_at),
    };
  }

  private async appendExchangeToMysql(
    message: ExecutionJob,
    reply: AssistantLlmGenerateResult,
    runId?: string,
  ): Promise<AssistantConversationState> {
    await this.assertMysqlSchemaReady();
    const pool = await this.mysqlService.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const now = this.toMysqlDateTime(new Date());
      const nextContext = reply.context.trim();
      const currentState = await this.readFromMysql(message);
      const summary = nextContext || currentState.context;
      await connection.query(
        `
          INSERT INTO conversation_threads (
            id, direction, chat, contact, status, created_at, updated_at, last_message_at
          )
          VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            direction = VALUES(direction),
            chat = VALUES(chat),
            contact = VALUES(contact),
            updated_at = VALUES(updated_at),
            last_message_at = VALUES(last_message_at)
        `,
        [
          message.conversation_id,
          message.direction,
          message.chat,
          message.contact,
          now,
          now,
          now,
        ],
      );
      const [sequenceRows] = await connection.query<
        Array<RowDataPacket & { max_sequence: number | null }>
      >(
        `
          SELECT COALESCE(MAX(sequence_no), 0) AS max_sequence
          FROM conversation_turns
          WHERE thread_id = ?
        `,
        [message.conversation_id],
      );
      const nextSequence = Number(sequenceRows[0]?.max_sequence ?? 0);
      await connection.query(
        `
          INSERT INTO conversation_turns (
            id, thread_id, run_id, role, message, sequence_no, created_at
          )
          VALUES (?, ?, ?, 'user', ?, ?, ?), (?, ?, ?, 'assistant', ?, ?, ?)
        `,
        [
          `turn_${randomUUID()}`,
          message.conversation_id,
          runId ?? null,
          message.message,
          nextSequence + 1,
          now,
          `turn_${randomUUID()}`,
          message.conversation_id,
          runId ?? null,
          reply.message,
          nextSequence + 2,
          now,
        ],
      );
      await connection.query(
        `
          INSERT INTO conversation_summaries (
            thread_id, summary, summary_version, updated_at
          )
          VALUES (?, ?, 1, ?)
          ON DUPLICATE KEY UPDATE
            summary = VALUES(summary),
            summary_version = summary_version + 1,
            updated_at = VALUES(updated_at)
        `,
        [message.conversation_id, summary, now],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return this.readFromMysql(message);
  }

  conversationPath(message: ExecutionJob): string {
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

  private storeDriver(): 'file' | 'mysql' {
    const driver = this.configService.get<string>('ASSISTANT_CONVERSATION_STORE_DRIVER', 'mysql');
    return driver === 'file' ? 'file' : 'mysql';
  }

  private emptyState(message: ExecutionJob): AssistantConversationState {
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

  private async assertMysqlSchemaReady(): Promise<void> {
    if (this.schemaReady) {
      return;
    }

    this.logger.log('Checking conversation MySQL schema');
    const pool = await this.mysqlService.getPool();
    for (const tableName of [
      'conversation_threads',
      'conversation_turns',
      'conversation_summaries',
    ]) {
      this.logger.log(`Checking conversation MySQL table table=${tableName}`);
      const [rows] = await pool.query<Array<RowDataPacket & { table_name: string }>>(
        `
          SELECT TABLE_NAME AS table_name
          FROM information_schema.tables
          WHERE table_schema = DATABASE()
            AND table_name = ?
          LIMIT 1
        `,
        [tableName],
      );

      if (rows.length === 0) {
        this.logger.error(`Missing conversation MySQL table table=${tableName}`);
        throw new Error(`Missing MySQL schema table: ${tableName}. Run npm run db:migrate first.`);
      }

      this.logger.log(`Conversation MySQL table ready table=${tableName}`);
    }

    this.schemaReady = true;
    this.logger.log('Conversation MySQL schema check completed');
  }

  private toIsoString(value: Date | string | null): string | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  private toMysqlDateTime(value: Date): string {
    return value.toISOString().slice(0, 23).replace('T', ' ');
  }
}
