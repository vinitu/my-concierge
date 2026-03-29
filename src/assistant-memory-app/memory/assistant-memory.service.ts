import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  mkdir,
  readdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import type {
  Pool,
  PoolConnection,
  QueryResult,
  RowDataPacket,
} from 'mysql2/promise';
import type {
  AssistantProfile,
  BaseMemoryWriteCandidate,
  ConversationAppendRequest,
  ConversationReadRequest,
  ConversationMessage,
  ConversationSearchRequest,
  ConversationSearchResponse,
  ConversationState,
  ConversationThreadListResponse,
  FederatedMemorySearchRequest,
  MemoryArchiveResponse,
  MemoryCompactResponse,
  MemoryEntry,
  MemoryKind,
  MemoryReindexResponse,
  MemorySearchEntry,
  MemorySearchResponse,
  MemoryWriteCandidate,
  MemoryWriteResult,
  ProfileUpdateRequest,
  ProfileUpdateResponse,
  TypedMemorySearchRequest,
} from '../../contracts/assistant-memory';
import { MysqlService } from '../../persistence/mysql.service';
import { AssistantMemoryMetricsService } from '../observability/assistant-memory-metrics.service';
import { AssistantMemoryRunEventPublisherService } from '../run-events/assistant-memory-run-event-publisher.service';

interface StoredIdempotencyRecord {
  createdAt: string;
  requestHash: string;
  response: MemoryWriteResult;
}

interface AssistantMemoryStore {
  entries: MemoryEntry[];
  idempotency: Record<string, StoredIdempotencyRecord>;
  profile: AssistantProfile;
}

interface StoredConversationState {
  chat: string;
  user_id: string;
  context: string;
  direction: string;
  messages: ConversationMessage[];
  updated_at: string | null;
}

type MemoryEventAction = 'added' | 'deleted' | 'readed' | 'updated';

interface MemoryEventContext {
  direction?: string;
  sourceRequestId?: string;
  userId?: string;
}

type MysqlQueryable = Pick<Pool, 'query'> | Pick<PoolConnection, 'query'>;

const EMPTY_PROFILE: AssistantProfile = {
  constraints: {},
  home: {},
  language: null,
  preferences: {},
  timezone: null,
  updatedAt: null,
};

@Injectable()
export class AssistantMemoryService {
  private readonly logger = new Logger(AssistantMemoryService.name);
  private schemaReady = false;
  private conversationSchemaReady = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: AssistantMemoryMetricsService,
    private readonly mysqlService: MysqlService,
    private readonly assistantMemoryRunEventPublisherService: AssistantMemoryRunEventPublisherService,
  ) {}

  async getProfile(): Promise<AssistantProfile> {
    if (this.storeDriver() === 'file') {
      return (await this.readStore()).profile;
    }

    return this.getProfileFromMysql();
  }

  async updateProfile(body: ProfileUpdateRequest): Promise<ProfileUpdateResponse> {
    if (this.storeDriver() === 'file') {
      return this.updateProfileInFile(body);
    }

    return this.updateProfileInMysql(body);
  }

  async search(body: FederatedMemorySearchRequest): Promise<MemorySearchResponse> {
    if (this.storeDriver() === 'file') {
      return this.searchInFile(body);
    }

    return this.searchInMysql(body);
  }

  async searchByKind(
    kind: MemoryKind,
    body: TypedMemorySearchRequest,
  ): Promise<MemorySearchResponse> {
    return this.search({
      ...body,
      kinds: [kind],
    });
  }

  async writeByKind(
    kind: MemoryKind,
    idempotencyKey: string | undefined,
    entries: BaseMemoryWriteCandidate[],
    eventContext?: MemoryEventContext,
  ): Promise<MemoryWriteResult> {
    const typedEntries = entries.map((entry) => ({
      ...entry,
      kind,
    }));

    if (this.storeDriver() === 'file') {
      return this.writeInFile(idempotencyKey, typedEntries, eventContext);
    }

    return this.writeInMysql(idempotencyKey, typedEntries, eventContext);
  }

  async getMemoryByKind(kind: MemoryKind, memoryId: string): Promise<MemoryEntry> {
    if (this.storeDriver() === 'file') {
      const store = await this.readStore();
      const entry = store.entries.find((candidate) => candidate.id === memoryId);

      if (!entry) {
        throw new NotFoundException(`Memory entry not found: ${memoryId}`);
      }

      this.assertKindMatch(kind, entry);
      this.logMemoryEvent(kind, 'readed', entry.id, {
        conversationThreadId: entry.conversationThreadId,
        scope: entry.scope,
      });
      return entry;
    }

    const entry = await this.getMemoryFromMysql(memoryId);
    this.assertKindMatch(kind, entry);
    this.logMemoryEvent(kind, 'readed', entry.id, {
      conversationThreadId: entry.conversationThreadId,
      scope: entry.scope,
    });
    return entry;
  }

  async archiveByKind(kind: MemoryKind, memoryId: string): Promise<MemoryArchiveResponse> {
    if (this.storeDriver() === 'file') {
      return this.archiveInFile(kind, memoryId);
    }

    return this.archiveInMysql(kind, memoryId);
  }

  async compact(): Promise<MemoryCompactResponse> {
    if (this.storeDriver() === 'file') {
      return this.compactInFile();
    }

    return this.compactInMysql();
  }

  async reindex(): Promise<MemoryReindexResponse> {
    if (this.storeDriver() === 'file') {
      const store = await this.readStore();
      this.metricsService.recordReindex(true);
      await this.refreshEntryCountsInFile(store);

      return {
        indexed: store.entries.filter((entry) => entry.archivedAt === null).length,
        status: 'reindexed',
      };
    }

    return this.reindexInMysql();
  }

  async listConversations(): Promise<ConversationThreadListResponse> {
    if (this.storeDriver() === 'file') {
      return this.listConversationsFromFile();
    }

    await this.assertConversationMysqlSchemaReady();
    const pool = await this.mysqlService.getPool();
    const [rows] = await pool.query<
      Array<
        RowDataPacket & {
          chat: string;
          user_id: string;
          direction: string;
          thread_id: string;
          updated_at: Date | string | null;
        }
      >
    >(
      `
        SELECT id AS thread_id, direction, chat, contact AS user_id, updated_at
        FROM conversation_threads
        ORDER BY COALESCE(updated_at, created_at) DESC
        LIMIT 100
      `,
    );

    return {
      count: rows.length,
      threads: rows.map((row) => ({
        chat: row.chat,
        user_id: row.user_id,
        direction: row.direction,
        thread_id: row.thread_id,
        updated_at: this.toIsoString(row.updated_at),
      })),
    };
  }

  async readConversation(body: ConversationReadRequest): Promise<ConversationState> {
    const userId = body.user_id?.trim() || 'default-user';
    const conversationMessage = {
      chat: body.chat,
      user_id: userId,
      conversation_id: body.conversation_id,
      direction: body.direction,
      message: '',
    };

    if (this.storeDriver() === 'file') {
      return this.readConversationFromFile(conversationMessage);
    }

    return this.readConversationFromMysql(conversationMessage);
  }

  async appendConversation(body: ConversationAppendRequest): Promise<ConversationState> {
    const userId = body.user_id?.trim() || 'default-user';
    const message = {
      chat: body.chat,
      user_id: userId,
      conversation_id: body.conversation_id,
      direction: body.direction,
      message: body.message,
    };

    if (this.storeDriver() === 'file') {
      return this.appendConversationInFile(body);
    }

    await this.assertConversationMysqlSchemaReady();
    const pool = await this.mysqlService.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const now = this.toMysqlDateTime(new Date());
      const currentState = await this.readConversationFromMysql(message, connection);
      const nextContext = body.reply.context.trim();
      const summary = nextContext || currentState.context;
      await connection.query(
        `
          INSERT IGNORE INTO conversation_threads (
            id, direction, chat, contact, status, created_at, updated_at, last_message_at
          )
          VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
        `,
        [
          message.conversation_id,
          message.direction,
          message.chat,
          message.user_id,
          now,
          now,
          now,
        ],
      );
      const [threadUpdateResult] = await connection.query<QueryResult>(
        `
          UPDATE conversation_threads
          SET
            direction = ?,
            chat = ?,
            contact = ?,
            updated_at = ?,
            last_message_at = ?
          WHERE id = ?
        `,
        [
          message.direction,
          message.chat,
          message.user_id,
          now,
          now,
          message.conversation_id,
        ],
      );
      const affectedRows =
        typeof threadUpdateResult === 'object' &&
        threadUpdateResult !== null &&
        'affectedRows' in threadUpdateResult &&
        typeof threadUpdateResult.affectedRows === 'number'
          ? threadUpdateResult.affectedRows
          : 0;
      if (affectedRows === 0) {
        throw new ConflictException(
          'assistant-memory schema is outdated: conversation_threads still enforces uniq_conversation_route. Run npm run db:migrate to use conversation_id as canonical thread id.',
        );
      }
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
          body.request_id ?? null,
          message.message,
          nextSequence + 1,
          now,
          `turn_${randomUUID()}`,
          message.conversation_id,
          body.request_id ?? null,
          body.reply.message,
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
      this.logger.debug(
        [
          'Conversation append committed',
          `conversation_id=${message.conversation_id}`,
          `request_id=${body.request_id ?? '(none)'}`,
          `summary_len=${summary.length}`,
          `user_msg_len=${message.message.length}`,
          `assistant_msg_len=${body.reply.message.length}`,
        ].join(' '),
      );
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return this.readConversationFromMysql(message);
  }

  async searchConversation(
    body: ConversationSearchRequest,
  ): Promise<ConversationSearchResponse> {
    if (this.storeDriver() === 'file') {
      return this.searchConversationInFile(body);
    }

    await this.assertConversationMysqlSchemaReady();
    const pool = await this.mysqlService.getPool();
    const [summaryRows] = await pool.query<Array<RowDataPacket & { summary: string }>>(
      `
        SELECT summary
        FROM conversation_summaries
        WHERE thread_id = ?
        LIMIT 1
      `,
      [body.conversation_id],
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
      [body.conversation_id, Math.max(1, Math.min(20, Math.floor(body.limit)))],
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
      thread_id: body.conversation_id,
    };
  }

  private async getProfileFromMysql(): Promise<AssistantProfile> {
    await this.assertMysqlSchemaReady();
    const pool = await this.mysqlService.getPool();
    const [rows] = await pool.query<
      Array<
        RowDataPacket & {
          constraints_json: unknown;
          home_json: unknown;
          language: string | null;
          preferences_json: unknown;
          timezone: string | null;
          updated_at: Date | string | null;
        }
      >
    >(
      `
        SELECT language, timezone, home_json, preferences_json, constraints_json, updated_at
        FROM user_profile
        WHERE id = 'default'
        LIMIT 1
      `,
    );

    if (rows.length === 0) {
      return { ...EMPTY_PROFILE };
    }

    return {
      constraints: this.parseJsonObject(rows[0].constraints_json),
      home: this.parseJsonObject(rows[0].home_json),
      language: rows[0].language,
      preferences: this.parseJsonObject(rows[0].preferences_json),
      timezone: rows[0].timezone,
      updatedAt: this.toIsoString(rows[0].updated_at),
    };
  }

  private async updateProfileInMysql(body: ProfileUpdateRequest): Promise<ProfileUpdateResponse> {
    await this.assertMysqlSchemaReady();
    const current = await this.getProfileFromMysql();
    const updatedAt = this.toMysqlDateTime(new Date());
    const updatedProfile: AssistantProfile = {
      constraints: body.constraints ?? current.constraints,
      home: body.home ?? current.home,
      language: body.language ?? current.language,
      preferences: body.preferences ?? current.preferences,
      timezone: body.timezone ?? current.timezone,
      updatedAt,
    };
    const pool = await this.mysqlService.getPool();
    await pool.query(
      `
        INSERT INTO user_profile (
          id, language, timezone, home_json, preferences_json, constraints_json, updated_at
        )
        VALUES ('default', ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          language = VALUES(language),
          timezone = VALUES(timezone),
          home_json = VALUES(home_json),
          preferences_json = VALUES(preferences_json),
          constraints_json = VALUES(constraints_json),
          updated_at = VALUES(updated_at)
      `,
      [
        updatedProfile.language,
        updatedProfile.timezone,
        JSON.stringify(updatedProfile.home),
        JSON.stringify(updatedProfile.preferences),
        JSON.stringify(updatedProfile.constraints),
        updatedAt,
      ],
    );
    this.metricsService.recordProfileUpdate(true);

    return {
      status: 'updated',
      updatedAt,
      updatedProfile,
    };
  }

  private async searchInMysql(body: FederatedMemorySearchRequest): Promise<MemorySearchResponse> {
    await this.assertMysqlSchemaReady();
    const pool = await this.mysqlService.getPool();
    const conditions: string[] = ['archived_at IS NULL'];
    const params: Array<number | string> = [];

    if (body.kinds?.length) {
      conditions.push(`kind IN (${body.kinds.map(() => '?').join(', ')})`);
      params.push(...body.kinds);
    }

    if (body.scopes?.length) {
      conditions.push(`scope IN (${body.scopes.map(() => '?').join(', ')})`);
      params.push(...body.scopes);
    }

    if (body.conversationThreadId) {
      conditions.push('conversation_thread_id = ?');
      params.push(body.conversationThreadId);
    }

    if (typeof body.recencyWindowDays === 'number' && body.recencyWindowDays > 0) {
      conditions.push('updated_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? DAY)');
      params.push(body.recencyWindowDays);
    }

    const [rows] = await pool.query<
      Array<
        RowDataPacket & {
          archived_at: Date | string | null;
          confidence: number | string;
          content: string;
          conversation_thread_id: string | null;
          created_at: Date | string;
          id: string;
          kind: MemoryEntry['kind'];
          last_accessed_at: Date | string | null;
          scope: string;
          source: string;
          updated_at: Date | string;
        }
      >
    >(
      `
        SELECT
          id,
          kind,
          scope,
          content,
          source,
          confidence,
          conversation_thread_id,
          last_accessed_at,
          created_at,
          updated_at,
          archived_at
        FROM memory_entries
        WHERE ${conditions.join(' AND ')}
      `,
      params,
    );
    const tags = await this.loadTags(rows.map((row) => row.id));
    const query = body.query.trim().toLowerCase();
    const filtered = rows
      .map((row) => {
        const entry: MemoryEntry = {
          archivedAt: this.toIsoString(row.archived_at),
          confidence: Number(row.confidence),
          content: row.content,
          conversationThreadId: row.conversation_thread_id,
          createdAt: this.toIsoString(row.created_at) ?? new Date().toISOString(),
          id: row.id,
          kind: row.kind,
          lastAccessedAt: this.toIsoString(row.last_accessed_at),
          scope: row.scope,
          source: row.source,
          tags: tags.get(row.id) ?? [],
          updatedAt: this.toIsoString(row.updated_at) ?? new Date().toISOString(),
        };

        return {
          ...entry,
          reason: this.searchReason(entry, query),
          score: this.scoreEntry(entry, query),
        };
      })
      .filter((entry) =>
        body.tags?.length ? body.tags.every((tag) => entry.tags.includes(tag)) : true,
      )
      .filter((entry) => (query.length === 0 ? true : (entry.score ?? 0) > 0))
      .sort((left, right) => {
        if ((right.score ?? 0) !== (left.score ?? 0)) {
          return (right.score ?? 0) - (left.score ?? 0);
        }

        return right.updatedAt.localeCompare(left.updatedAt);
      });
    const limit =
      typeof body.limit === 'number' && Number.isFinite(body.limit)
        ? Math.max(1, Math.min(20, Math.floor(body.limit)))
        : 8;
    const entries = filtered.slice(0, limit);
    await this.touchMysqlEntries(entries.map((entry) => entry.id));
    this.metricsService.recordSearch(this.searchMetricKind(body.kinds), true);

    return {
      count: entries.length,
      entries: entries as MemorySearchEntry[],
    };
  }

  private async writeInMysql(
    idempotencyKey: string | undefined,
    entries: MemoryWriteCandidate[],
    eventContext?: MemoryEventContext,
  ): Promise<MemoryWriteResult> {
    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    await this.assertMysqlSchemaReady();
    const requestHash = createHash('sha256')
      .update(JSON.stringify(entries))
      .digest('hex');
    const pool = await this.mysqlService.getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const [idempotencyRows] = await connection.query<
        Array<RowDataPacket & { request_hash: string; response_json: string }>
      >(
        `
          SELECT request_hash, response_json
          FROM memory_idempotency_keys
          WHERE idempotency_key = ?
          LIMIT 1
        `,
        [idempotencyKey],
      );

      if (idempotencyRows.length > 0) {
        if (idempotencyRows[0].request_hash !== requestHash) {
          this.metricsService.recordWrite(this.writeMetricKind(entries), false);
          throw new ConflictException('Idempotency-Key conflict');
        }

        await connection.commit();
        this.metricsService.recordWrite(this.writeMetricKind(entries), true);
        return JSON.parse(idempotencyRows[0].response_json) as MemoryWriteResult;
      }

      let created = 0;
      let updated = 0;
      const savedEntries: MemoryEntry[] = [];
      const now = this.toMysqlDateTime(new Date());

      for (const candidate of entries) {
        this.validateCandidate(candidate);
        const [existingRows] = await connection.query<
          Array<RowDataPacket & { id: string }>
        >(
          `
            SELECT id
            FROM memory_entries
            WHERE archived_at IS NULL
              AND kind = ?
              AND scope = ?
              AND content = ?
            LIMIT 1
          `,
          [candidate.kind, candidate.scope, candidate.content],
        );
        const normalizedTags = Array.from(new Set(candidate.tags ?? [])).sort();

        if (existingRows.length > 0) {
          const existingId = existingRows[0].id;
          await connection.query(
            `
              UPDATE memory_entries
              SET
                confidence = GREATEST(confidence, ?),
                source = ?,
                conversation_thread_id = COALESCE(?, conversation_thread_id),
                updated_at = ?,
                archived_at = NULL
              WHERE id = ?
            `,
            [
              candidate.confidence,
              candidate.source,
              candidate.conversationThreadId ?? null,
              now,
              existingId,
            ],
          );
          for (const tag of normalizedTags) {
            await connection.query(
              `
                INSERT IGNORE INTO memory_entry_tags (entry_id, tag)
                VALUES (?, ?)
              `,
              [existingId, tag],
            );
          }
          savedEntries.push(await this.getMemoryFromMysql(existingId, connection));
        this.logMemoryEvent(candidate.kind, 'updated', existingId, {
          conversationThreadId: candidate.conversationThreadId ?? null,
          direction: eventContext?.direction,
          scope: candidate.scope,
          sourceRequestId: eventContext?.sourceRequestId,
          userId: eventContext?.userId,
        });
          updated += 1;
          continue;
        }

        const memoryId = `mem_${randomUUID()}`;
        await connection.query(
          `
            INSERT INTO memory_entries (
              id,
              kind,
              scope,
              content,
              source,
              confidence,
              conversation_thread_id,
              last_accessed_at,
              created_at,
              updated_at,
              archived_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)
          `,
          [
            memoryId,
            candidate.kind,
            candidate.scope,
            candidate.content,
            candidate.source,
            candidate.confidence,
            candidate.conversationThreadId ?? null,
            now,
            now,
          ],
        );
        for (const tag of normalizedTags) {
          await connection.query(
            `
              INSERT INTO memory_entry_tags (entry_id, tag)
              VALUES (?, ?)
            `,
            [memoryId, tag],
          );
        }
        savedEntries.push(await this.getMemoryFromMysql(memoryId, connection));
        this.logMemoryEvent(candidate.kind, 'added', memoryId, {
          conversationThreadId: candidate.conversationThreadId ?? null,
          direction: eventContext?.direction,
          scope: candidate.scope,
          sourceRequestId: eventContext?.sourceRequestId,
          userId: eventContext?.userId,
        });
        created += 1;
      }

      const response: MemoryWriteResult = {
        created,
        entries: savedEntries,
        updated,
      };
      await connection.query(
        `
          INSERT INTO memory_idempotency_keys (
            idempotency_key, request_hash, response_json, created_at, expires_at
          )
          VALUES (?, ?, ?, ?, DATE_ADD(?, INTERVAL 7 DAY))
        `,
        [idempotencyKey, requestHash, JSON.stringify(response), now, now],
      );
      await connection.commit();
      this.metricsService.recordWrite(this.writeMetricKind(entries), true);
      await this.refreshEntryCountsInMysql();
      return response;
    } catch (error) {
      if (entries.length > 0) {
        this.metricsService.recordWrite(this.writeMetricKind(entries), false);
      }
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  private async getMemoryFromMysql(
    memoryId: string,
    connectionOverride?: MysqlQueryable,
  ): Promise<MemoryEntry> {
    await this.assertMysqlSchemaReady();
    const connection = connectionOverride ?? (await this.mysqlService.getPool());
    const [rows] = await connection.query<
      Array<
        RowDataPacket & {
          archived_at: Date | string | null;
          confidence: number | string;
          content: string;
          conversation_thread_id: string | null;
          created_at: Date | string;
          id: string;
          kind: MemoryEntry['kind'];
          last_accessed_at: Date | string | null;
          scope: string;
          source: string;
          updated_at: Date | string;
        }
      >
    >(
      `
        SELECT
          id,
          kind,
          scope,
          content,
          source,
          confidence,
          conversation_thread_id,
          last_accessed_at,
          created_at,
          updated_at,
          archived_at
        FROM memory_entries
        WHERE id = ?
        LIMIT 1
      `,
      [memoryId],
    );

    if (rows.length === 0) {
      throw new NotFoundException(`Memory entry not found: ${memoryId}`);
    }

    const tags = await this.loadTags([memoryId], connection);
    return {
      archivedAt: this.toIsoString(rows[0].archived_at),
      confidence: Number(rows[0].confidence),
      content: rows[0].content,
      conversationThreadId: rows[0].conversation_thread_id,
      createdAt: this.toIsoString(rows[0].created_at) ?? new Date().toISOString(),
      id: rows[0].id,
      kind: rows[0].kind,
      lastAccessedAt: this.toIsoString(rows[0].last_accessed_at),
      scope: rows[0].scope,
      source: rows[0].source,
      tags: tags.get(memoryId) ?? [],
      updatedAt: this.toIsoString(rows[0].updated_at) ?? new Date().toISOString(),
    };
  }

  private async archiveInMysql(kind: MemoryKind, memoryId: string): Promise<MemoryArchiveResponse> {
    await this.assertMysqlSchemaReady();
    const entry = await this.getMemoryFromMysql(memoryId);
    this.assertKindMatch(kind, entry);
    const now = this.toMysqlDateTime(new Date());
    const pool = await this.mysqlService.getPool();
    const [result] = await pool.query<QueryResult>(
      `
        UPDATE memory_entries
        SET archived_at = ?, updated_at = ?
        WHERE id = ?
      `,
      [now, now, memoryId],
    );
    const affectedRows =
      typeof result === 'object' && result !== null && 'affectedRows' in result
        ? Number(result.affectedRows)
        : 0;

    if (affectedRows === 0) {
      this.metricsService.recordArchive(kind, false);
      throw new NotFoundException(`Memory entry not found: ${memoryId}`);
    }

    this.metricsService.recordArchive(kind, true);
    await this.refreshEntryCountsInMysql();
    this.logMemoryEvent(kind, 'deleted', memoryId, {
      conversationThreadId: entry.conversationThreadId,
      scope: entry.scope,
    });
    return {
      archivedAt: now,
      id: memoryId,
      kind,
      status: 'archived',
    };
  }

  private async compactInMysql(): Promise<MemoryCompactResponse> {
    await this.assertMysqlSchemaReady();
    const pool = await this.mysqlService.getPool();
    const [rows] = await pool.query<
      Array<RowDataPacket & { all_ids: string; canonical_id: string }>
    >(
      `
        SELECT
          MIN(id) AS canonical_id,
          GROUP_CONCAT(id ORDER BY id ASC) AS all_ids
        FROM memory_entries
        WHERE archived_at IS NULL
        GROUP BY kind, scope, content
        HAVING COUNT(*) > 1
      `,
    );
    const now = this.toMysqlDateTime(new Date());
    let archived = 0;

    for (const row of rows) {
      const ids = row.all_ids.split(',').filter((id) => id !== row.canonical_id);
      if (ids.length === 0) {
        continue;
      }

      await pool.query(
        `
          UPDATE memory_entries
          SET archived_at = ?, updated_at = ?
          WHERE id IN (${ids.map(() => '?').join(', ')})
        `,
        [now, now, ...ids],
      );
      archived += ids.length;
    }

    this.metricsService.recordCompact(true);
    await this.refreshEntryCountsInMysql();
    return {
      archived,
      status: 'compacted',
    };
  }

  private async reindexInMysql(): Promise<MemoryReindexResponse> {
    await this.assertMysqlSchemaReady();
    const pool = await this.mysqlService.getPool();
    const [rows] = await pool.query<Array<RowDataPacket & { total: number }>>(
      `
        SELECT COUNT(*) AS total
        FROM memory_entries
        WHERE archived_at IS NULL
      `,
    );
    this.metricsService.recordReindex(true);
    await this.refreshEntryCountsInMysql();

    return {
      indexed: Number(rows[0]?.total ?? 0),
      status: 'reindexed',
    };
  }

  private async updateProfileInFile(body: ProfileUpdateRequest): Promise<ProfileUpdateResponse> {
    const store = await this.readStore();
    const updatedAt = this.toMysqlDateTime(new Date());
    const updatedProfile: AssistantProfile = {
      constraints: body.constraints ?? store.profile.constraints,
      home: body.home ?? store.profile.home,
      language: body.language ?? store.profile.language,
      preferences: body.preferences ?? store.profile.preferences,
      timezone: body.timezone ?? store.profile.timezone,
      updatedAt,
    };

    await this.writeStore({
      ...store,
      profile: updatedProfile,
    });
    this.metricsService.recordProfileUpdate(true);

    return {
      status: 'updated',
      updatedAt,
      updatedProfile,
    };
  }

  private async searchInFile(body: FederatedMemorySearchRequest): Promise<MemorySearchResponse> {
    const store = await this.readStore();
    const now = Date.now();
    const maxAgeMs =
      typeof body.recencyWindowDays === 'number' && body.recencyWindowDays > 0
        ? body.recencyWindowDays * 24 * 60 * 60 * 1000
        : null;
    const query = body.query.trim().toLowerCase();
    const filtered = store.entries
      .filter((entry) => entry.archivedAt === null)
      .filter((entry) => (body.kinds?.length ? body.kinds.includes(entry.kind) : true))
      .filter((entry) => (body.scopes?.length ? body.scopes.includes(entry.scope) : true))
      .filter((entry) =>
        body.tags?.length ? body.tags.every((tag) => entry.tags.includes(tag)) : true,
      )
      .filter((entry) =>
        body.conversationThreadId
          ? entry.conversationThreadId === body.conversationThreadId
          : true,
      )
      .filter((entry) =>
        maxAgeMs === null ? true : now - Date.parse(entry.updatedAt) <= maxAgeMs,
      )
      .map((entry) => ({
        ...entry,
        reason: this.searchReason(entry, query),
        score: this.scoreEntry(entry, query),
      }))
      .filter((entry) => (query.length === 0 ? true : (entry.score ?? 0) > 0))
      .sort((left, right) => {
        if ((right.score ?? 0) !== (left.score ?? 0)) {
          return (right.score ?? 0) - (left.score ?? 0);
        }

        return right.updatedAt.localeCompare(left.updatedAt);
      });
    const limit =
      typeof body.limit === 'number' && Number.isFinite(body.limit)
        ? Math.max(1, Math.min(20, Math.floor(body.limit)))
        : 8;
    const entries = filtered.slice(0, limit);
    await this.touchEntries(store, entries.map((entry) => entry.id));
    this.metricsService.recordSearch(this.searchMetricKind(body.kinds), true);

    return {
      count: entries.length,
      entries: entries as MemorySearchEntry[],
    };
  }

  private async writeInFile(
    idempotencyKey: string | undefined,
    entries: MemoryWriteCandidate[],
    eventContext?: MemoryEventContext,
  ): Promise<MemoryWriteResult> {
    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const requestHash = createHash('sha256')
      .update(JSON.stringify(entries))
      .digest('hex');
    const store = await this.readStore();
    const existing = store.idempotency[idempotencyKey];

    if (existing) {
      if (existing.requestHash !== requestHash) {
        this.metricsService.recordWrite(this.writeMetricKind(entries), false);
        throw new ConflictException('Idempotency-Key conflict');
      }

      this.metricsService.recordWrite(this.writeMetricKind(entries), true);
      return existing.response;
    }

    let created = 0;
    let updated = 0;
    const savedEntries: MemoryEntry[] = [];
    const now = this.toMysqlDateTime(new Date());

    for (const candidate of entries) {
      this.validateCandidate(candidate);
      const normalizedTags = Array.from(new Set(candidate.tags ?? [])).sort();
      const existingEntry = store.entries.find(
        (entry) =>
          entry.archivedAt === null &&
          entry.kind === candidate.kind &&
          entry.scope === candidate.scope &&
          entry.content === candidate.content,
      );

      if (existingEntry) {
        existingEntry.confidence = Math.max(existingEntry.confidence, candidate.confidence);
        existingEntry.conversationThreadId =
          candidate.conversationThreadId ?? existingEntry.conversationThreadId;
        existingEntry.source = candidate.source;
        existingEntry.tags = Array.from(new Set([...existingEntry.tags, ...normalizedTags])).sort();
        existingEntry.updatedAt = now;
        savedEntries.push(existingEntry);
        this.logMemoryEvent(candidate.kind, 'updated', existingEntry.id, {
          conversationThreadId: candidate.conversationThreadId ?? existingEntry.conversationThreadId,
          direction: eventContext?.direction,
          scope: candidate.scope,
          sourceRequestId: eventContext?.sourceRequestId,
          userId: eventContext?.userId,
        });
        updated += 1;
        continue;
      }

      const nextEntry: MemoryEntry = {
        archivedAt: null,
        confidence: candidate.confidence,
        content: candidate.content,
        conversationThreadId: candidate.conversationThreadId ?? null,
        createdAt: now,
        id: `mem_${randomUUID()}`,
        kind: candidate.kind,
        lastAccessedAt: null,
        scope: candidate.scope,
        source: candidate.source,
        tags: normalizedTags,
        updatedAt: now,
      };

      store.entries.push(nextEntry);
      savedEntries.push(nextEntry);
      this.logMemoryEvent(candidate.kind, 'added', nextEntry.id, {
        conversationThreadId: nextEntry.conversationThreadId,
        direction: eventContext?.direction,
        scope: nextEntry.scope,
        sourceRequestId: eventContext?.sourceRequestId,
        userId: eventContext?.userId,
      });
      created += 1;
    }

    const response: MemoryWriteResult = {
      created,
      entries: savedEntries,
      updated,
    };

    store.idempotency[idempotencyKey] = {
      createdAt: now,
      requestHash,
      response,
    };

    await this.writeStore(store);
    this.metricsService.recordWrite(this.writeMetricKind(entries), true);
    await this.refreshEntryCountsInFile(store);

    return response;
  }

  private async archiveInFile(kind: MemoryKind, memoryId: string): Promise<MemoryArchiveResponse> {
    const store = await this.readStore();
    const entry = store.entries.find((candidate) => candidate.id === memoryId);

    if (!entry) {
      this.metricsService.recordArchive(kind, false);
      throw new NotFoundException(`Memory entry not found: ${memoryId}`);
    }

    this.assertKindMatch(kind, entry);
    const archivedAt = this.toMysqlDateTime(new Date());
    entry.archivedAt = archivedAt;
    entry.updatedAt = archivedAt;
    await this.writeStore(store);
    this.metricsService.recordArchive(kind, true);
    await this.refreshEntryCountsInFile(store);
    this.logMemoryEvent(kind, 'deleted', entry.id, {
      conversationThreadId: entry.conversationThreadId,
      scope: entry.scope,
    });

    return {
      archivedAt,
      id: entry.id,
      kind,
      status: 'archived',
    };
  }

  private async compactInFile(): Promise<MemoryCompactResponse> {
    const store = await this.readStore();
    const seen = new Map<string, MemoryEntry>();
    let archived = 0;
    const now = this.toMysqlDateTime(new Date());

    for (const entry of store.entries) {
      if (entry.archivedAt) {
        continue;
      }

      const dedupeKey = `${entry.kind}:${entry.scope}:${entry.content}`;
      const existing = seen.get(dedupeKey);

      if (!existing) {
        seen.set(dedupeKey, entry);
        continue;
      }

      existing.tags = Array.from(new Set([...existing.tags, ...entry.tags])).sort();
      existing.confidence = Math.max(existing.confidence, entry.confidence);
      existing.updatedAt = now;
      entry.archivedAt = now;
      entry.updatedAt = now;
      archived += 1;
    }

    await this.writeStore(store);
    this.metricsService.recordCompact(true);
    await this.refreshEntryCountsInFile(store);

    return {
      archived,
      status: 'compacted',
    };
  }

  private async touchEntries(store: AssistantMemoryStore, ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    const touchedAt = new Date().toISOString();

    for (const entry of store.entries) {
      if (ids.includes(entry.id)) {
        entry.lastAccessedAt = touchedAt;
      }
    }

    await this.writeStore(store);
  }

  private scoreEntry(entry: MemoryEntry, query: string): number {
    if (query.length === 0) {
      return this.kindWeight(entry.kind) + this.recencyBoost(entry.updatedAt);
    }

    const haystacks = [
      entry.content.toLowerCase(),
      entry.scope.toLowerCase(),
      entry.kind.toLowerCase(),
      entry.tags.join(' ').toLowerCase(),
    ];
    const exactHit = haystacks.some((value) => value.includes(query));

    if (exactHit) {
      return 1 + this.kindWeight(entry.kind) + this.recencyBoost(entry.updatedAt);
    }

    const terms = query.split(/\s+/).filter((term) => term.length > 0);

    if (terms.length === 0) {
      return 0;
    }

    const matchedTerms = terms.filter((term) => haystacks.some((value) => value.includes(term)));
    return matchedTerms.length / terms.length + this.kindWeight(entry.kind) + this.recencyBoost(entry.updatedAt);
  }

  private searchReason(entry: MemoryEntry, query: string): string {
    if (query.length === 0) {
      return `matched active ${entry.kind} entry`;
    }

    const haystack = `${entry.content} ${entry.tags.join(' ')} ${entry.scope}`.toLowerCase();

    if (haystack.includes(query)) {
      return `direct text match in ${entry.kind}`;
    }

    return `partial text and ranking match in ${entry.kind}`;
  }

  private validateCandidate(candidate: MemoryWriteCandidate): void {
    const content = candidate.content.trim();

    if (content.length < 8) {
      this.rejectCandidate(candidate.kind, 'content_too_short');
    }

    if (candidate.confidence < 0.5 || candidate.confidence > 1) {
      this.rejectCandidate(candidate.kind, 'invalid_confidence');
    }

    switch (candidate.kind) {
      case 'preference':
        if (this.looksLikeEpisode(content) || this.looksLikeProjectStatus(content)) {
          this.rejectCandidate(candidate.kind, 'episodic_or_project_like');
        }
        break;
      case 'fact':
        if (this.looksSubjective(content) || this.looksSpeculative(content) || this.looksLikeProjectStatus(content)) {
          this.rejectCandidate(candidate.kind, 'subjective_or_speculative');
        }
        break;
      case 'routine':
        if (this.looksOneTimeEvent(content)) {
          this.rejectCandidate(candidate.kind, 'one_time_event');
        }
        break;
      case 'project':
        if (this.looksSubjective(content)) {
          this.rejectCandidate(candidate.kind, 'subjective_project_state');
        }
        break;
      case 'episode':
        if (this.looksPermanentSetting(content)) {
          this.rejectCandidate(candidate.kind, 'permanent_setting');
        }
        if (this.looksLikeGreetingNoise(content)) {
          this.rejectCandidate(candidate.kind, 'greeting_noise');
        }
        break;
      case 'rule':
        if (!this.looksLikeRule(content) || this.looksSpeculative(content)) {
          this.rejectCandidate(candidate.kind, 'ambiguous_rule');
        }
        break;
    }
  }

  private rejectCandidate(kind: MemoryKind, reason: string): never {
    this.metricsService.recordValidationFailure(kind, reason);
    throw new BadRequestException(`Rejected ${kind} candidate: ${reason}`);
  }

  private assertKindMatch(kind: MemoryKind, entry: MemoryEntry): void {
    if (entry.kind !== kind) {
      throw new NotFoundException(`Memory entry not found: ${entry.id}`);
    }
  }

  private searchMetricKind(kinds?: MemoryKind[]): MemoryKind | 'federated' {
    return kinds?.length === 1 ? kinds[0] : 'federated';
  }

  private writeMetricKind(entries: MemoryWriteCandidate[]): MemoryKind {
    return entries[0]?.kind ?? 'episode';
  }

  private kindWeight(kind: MemoryKind): number {
    switch (kind) {
      case 'rule':
        return 0.2;
      case 'preference':
      case 'fact':
        return 0.12;
      case 'project':
        return 0.1;
      case 'episode':
        return 0.08;
      case 'routine':
        return 0.06;
    }
  }

  private recencyBoost(updatedAt: string): number {
    const ageHours = (Date.now() - Date.parse(updatedAt)) / (1000 * 60 * 60);

    if (!Number.isFinite(ageHours) || ageHours < 0) {
      return 0;
    }

    if (ageHours <= 24) {
      return 0.15;
    }

    if (ageHours <= 24 * 7) {
      return 0.08;
    }

    if (ageHours <= 24 * 30) {
      return 0.03;
    }

    return 0;
  }

  private looksLikeEpisode(value: string): boolean {
    const lower = value.toLowerCase();
    return (
      /\bon \d{4}-\d{2}-\d{2}\b/.test(lower) ||
      /\b(yesterday|today|last week|discussed|decided|chose)\b/.test(lower)
    );
  }

  private looksLikeProjectStatus(value: string): boolean {
    return /\b(project|migration|implementation|redesign|rollout|phase)\b/i.test(value);
  }

  private looksSubjective(value: string): boolean {
    return /\b(prefers|likes|loves|dislikes|favorite|usually prefers)\b/i.test(value);
  }

  private looksSpeculative(value: string): boolean {
    return /\b(maybe|might|probably|perhaps|seems|appears)\b/i.test(value);
  }

  private looksOneTimeEvent(value: string): boolean {
    return /\b(on \d{4}-\d{2}-\d{2}|tomorrow|tonight|meeting at|appointment at)\b/i.test(value);
  }

  private looksPermanentSetting(value: string): boolean {
    return /\b(timezone|language|always|never|prefers|use mysql)\b/i.test(value);
  }

  private looksLikeRule(value: string): boolean {
    return /\b(always|never|only|must|do not|should not|use )\b/i.test(value);
  }

  private looksLikeGreetingNoise(value: string): boolean {
    const normalized = value.trim().toLowerCase();

    return (
      /^(привет|здравствуйте|hello|hi|hey|ghbdtn|как дела)[!.?,\s]*$/i.test(normalized) ||
      /^(user said|user asked|assistant replied)\b/.test(normalized) ||
      /^user said\s+"[^"]+"\s+in\s+[a-z]+\.?$/.test(normalized)
    );
  }

  private async refreshEntryCountsInMysql(): Promise<void> {
    await this.assertMysqlSchemaReady();
    const pool = await this.mysqlService.getPool();
    const [rows] = await pool.query<Array<RowDataPacket & { kind: MemoryKind; total: number }>>(
      `
        SELECT kind, COUNT(*) AS total
        FROM memory_entries
        WHERE archived_at IS NULL
        GROUP BY kind
      `,
    );
    const counts = new Map<MemoryKind, number>();

    for (const row of rows) {
      counts.set(row.kind, Number(row.total));
    }

    for (const kind of ['episode', 'fact', 'preference', 'project', 'routine', 'rule'] as MemoryKind[]) {
      this.metricsService.setEntryCount(kind, counts.get(kind) ?? 0);
    }
  }

  private async refreshEntryCountsInFile(store: AssistantMemoryStore): Promise<void> {
    const counts = new Map<MemoryKind, number>();

    for (const entry of store.entries) {
      if (entry.archivedAt !== null) {
        continue;
      }

      counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
    }

    for (const kind of ['episode', 'fact', 'preference', 'project', 'routine', 'rule'] as MemoryKind[]) {
      this.metricsService.setEntryCount(kind, counts.get(kind) ?? 0);
    }
  }

  private storagePath(): string {
    return join(
      this.datadir(),
      'memory-store.json',
    );
  }

  private conversationsDirectory(): string {
    return join(this.datadir(), 'conversations');
  }

  private conversationPath(conversationId: string): string {
    return join(this.conversationsDirectory(), `${conversationId}.json`);
  }

  private datadir(): string {
    return this.configService.get<string>(
      'ASSISTANT_MEMORY_DATADIR',
      join(process.cwd(), 'runtime', 'assistant-memory'),
    );
  }

  private storeDriver(): 'file' | 'mysql' {
    const driver = this.configService.get<string>('ASSISTANT_MEMORY_STORE_DRIVER', 'mysql');
    return driver === 'file' ? 'file' : 'mysql';
  }

  private async readStore(): Promise<AssistantMemoryStore> {
    try {
      const raw = await readFile(this.storagePath(), 'utf8');
      const parsed = JSON.parse(raw) as Partial<AssistantMemoryStore>;

      return {
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        idempotency:
          typeof parsed.idempotency === 'object' && parsed.idempotency !== null
            ? parsed.idempotency
            : {},
        profile: this.normalizeProfile(parsed.profile),
      };
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return {
          entries: [],
          idempotency: {},
          profile: { ...EMPTY_PROFILE },
        };
      }

      throw error;
    }
  }

  private normalizeProfile(profile: unknown): AssistantProfile {
    if (typeof profile !== 'object' || profile === null) {
      return { ...EMPTY_PROFILE };
    }

    const candidate = profile as Partial<AssistantProfile>;
    return {
      constraints:
        typeof candidate.constraints === 'object' && candidate.constraints !== null
          ? candidate.constraints
          : {},
      home:
        typeof candidate.home === 'object' && candidate.home !== null ? candidate.home : {},
      language: typeof candidate.language === 'string' ? candidate.language : null,
      preferences:
        typeof candidate.preferences === 'object' && candidate.preferences !== null
          ? candidate.preferences
          : {},
      timezone: typeof candidate.timezone === 'string' ? candidate.timezone : null,
      updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : null,
    };
  }

  private async writeStore(store: AssistantMemoryStore): Promise<void> {
    await mkdir(dirname(this.storagePath()), { recursive: true });
    await writeFile(this.storagePath(), `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  }

  private async listConversationsFromFile(): Promise<ConversationThreadListResponse> {
    try {
      const entries = await readdir(this.conversationsDirectory(), { withFileTypes: true });
      const threads: ConversationThreadListResponse['threads'] = [];

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) {
          continue;
        }

        const conversationId = entry.name.slice(0, -5);
        const state = await this.readConversationFileState(conversationId);
        if (!state) {
          continue;
        }

        threads.push({
          chat: state.chat,
          user_id: state.user_id,
          direction: state.direction,
          thread_id: conversationId,
          updated_at: state.updated_at,
        });
      }

      threads.sort((left, right) =>
        String(right.updated_at ?? '').localeCompare(String(left.updated_at ?? '')),
      );

      return {
        count: threads.length,
        threads: threads.slice(0, 100),
      };
    } catch (error) {
      if (this.isMissingPath(error)) {
        return {
          count: 0,
          threads: [],
        };
      }

      throw error;
    }
  }

  private async readConversationFromFile(message: {
    chat: string;
    user_id: string;
    conversation_id: string;
    direction: string;
    message: string;
  }): Promise<ConversationState> {
    const stored = await this.readConversationFileState(message.conversation_id);
    if (!stored) {
      return this.emptyConversationState(message);
    }

    return {
      chat: stored.chat,
      user_id: stored.user_id,
      context: stored.context,
      direction: stored.direction,
      messages: stored.messages,
      updated_at: stored.updated_at,
    };
  }

  private async appendConversationInFile(
    body: ConversationAppendRequest,
  ): Promise<ConversationState> {
    const current = await this.readConversationFromFile({
      chat: body.chat,
      user_id: body.user_id,
      conversation_id: body.conversation_id,
      direction: body.direction,
      message: body.message,
    });
    const nowIso = new Date().toISOString();
    const nextContext = body.reply.context.trim();
    const nextMessages: ConversationMessage[] = [
      ...current.messages,
      {
        content: body.message,
        created_at: nowIso,
        role: 'user' as const,
      },
      {
        content: body.reply.message,
        created_at: nowIso,
        role: 'assistant' as const,
      },
    ].slice(-20);
    const nextState: StoredConversationState = {
      chat: body.chat,
      user_id: body.user_id,
      context: nextContext.length > 0 ? nextContext : current.context,
      direction: body.direction,
      messages: nextMessages,
      updated_at: nowIso,
    };

    await mkdir(this.conversationsDirectory(), { recursive: true });
    await writeFile(
      this.conversationPath(body.conversation_id),
      `${JSON.stringify(nextState, null, 2)}\n`,
      'utf8',
    );

    return {
      chat: nextState.chat,
      user_id: nextState.user_id,
      context: nextState.context,
      direction: nextState.direction,
      messages: nextState.messages,
      updated_at: nextState.updated_at,
    };
  }

  private async searchConversationInFile(
    body: ConversationSearchRequest,
  ): Promise<ConversationSearchResponse> {
    const state = await this.readConversationFileState(body.conversation_id);
    if (!state) {
      return {
        messages: [],
        summary: '',
        thread_id: body.conversation_id,
      };
    }

    const limit = Math.max(1, Math.min(20, Math.floor(body.limit)));

    return {
      messages: state.messages.slice(-limit),
      summary: state.context,
      thread_id: body.conversation_id,
    };
  }

  private async readConversationFileState(
    conversationId: string,
  ): Promise<StoredConversationState | null> {
    try {
      const raw = await readFile(this.conversationPath(conversationId), 'utf8');
      const parsed = JSON.parse(raw) as Partial<StoredConversationState>;
      const messages = Array.isArray(parsed.messages)
        ? parsed.messages
            .map((entry) => this.normalizeConversationMessage(entry))
            .filter((entry): entry is ConversationMessage => entry !== null)
        : [];

      return {
        chat: typeof parsed.chat === 'string' ? parsed.chat : 'direct',
        user_id: typeof parsed.user_id === 'string' ? parsed.user_id : 'default-user',
        context: typeof parsed.context === 'string' ? parsed.context : '',
        direction: typeof parsed.direction === 'string' ? parsed.direction : 'web',
        messages,
        updated_at: typeof parsed.updated_at === 'string' ? parsed.updated_at : null,
      };
    } catch (error) {
      if (this.isMissingPath(error)) {
        return null;
      }

      throw error;
    }
  }

  private normalizeConversationMessage(value: unknown): ConversationMessage | null {
    if (typeof value !== 'object' || value === null) {
      return null;
    }

    const message = value as Partial<ConversationMessage>;
    if (message.role !== 'assistant' && message.role !== 'user') {
      return null;
    }
    if (typeof message.content !== 'string' || typeof message.created_at !== 'string') {
      return null;
    }

    return {
      content: message.content,
      created_at: message.created_at,
      role: message.role,
    };
  }

  private async readConversationFromMysql(
    message: {
      chat: string;
      user_id: string;
      conversation_id: string;
      direction: string;
      message: string;
    },
    connectionOverride?: MysqlQueryable,
  ): Promise<ConversationState> {
    await this.assertConversationMysqlSchemaReady();
    const connection = connectionOverride ?? (await this.mysqlService.getPool());
    const [threads] = await connection.query<
      Array<
        RowDataPacket & {
          chat: string;
          user_id: string;
          direction: string;
          updated_at: Date | string | null;
        }
      >
    >(
      `
        SELECT chat, contact AS user_id, direction, updated_at
        FROM conversation_threads
        WHERE id = ?
        LIMIT 1
      `,
      [message.conversation_id],
    );

    if (threads.length === 0) {
      return this.emptyConversationState(message);
    }

    const [summaries] = await connection.query<Array<RowDataPacket & { summary: string }>>(
      `
        SELECT summary
        FROM conversation_summaries
        WHERE thread_id = ?
        LIMIT 1
      `,
      [message.conversation_id],
    );
    const [turnRows] = await connection.query<
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
        LIMIT 20
      `,
      [message.conversation_id],
    );

    return {
      chat: threads[0].chat,
      user_id: threads[0].user_id,
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

  private emptyConversationState(message: {
    chat: string;
    user_id: string;
    direction: string;
  }): ConversationState {
    return {
      chat: message.chat,
      user_id: message.user_id,
      context: '',
      direction: message.direction,
      messages: [],
      updated_at: null,
    };
  }

  private async assertMysqlSchemaReady(): Promise<void> {
    if (this.schemaReady) {
      return;
    }

    const pool = await this.mysqlService.getPool();
    for (const tableName of [
      'user_profile',
      'memory_entries',
      'memory_entry_tags',
      'memory_idempotency_keys',
    ]) {
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
        throw new Error(`Missing MySQL schema table: ${tableName}. Run npm run db:migrate first.`);
      }
    }

    this.schemaReady = true;
  }

  private async assertConversationMysqlSchemaReady(): Promise<void> {
    if (this.conversationSchemaReady) {
      return;
    }

    const pool = await this.mysqlService.getPool();
    for (const tableName of [
      'conversation_threads',
      'conversation_turns',
      'conversation_summaries',
    ]) {
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
        throw new Error(`Missing MySQL schema table: ${tableName}. Run npm run db:migrate first.`);
      }
    }

    this.conversationSchemaReady = true;
  }

  private parseJsonObject(value: unknown): Record<string, unknown> {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value) as unknown;
        return typeof parsed === 'object' && parsed !== null
          ? (parsed as Record<string, unknown>)
          : {};
      } catch {
        return {};
      }
    }

    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
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

  private async loadTags(
    ids: string[],
    connectionOverride?: MysqlQueryable,
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();

    if (ids.length === 0) {
      return result;
    }

    const connection = connectionOverride ?? (await this.mysqlService.getPool());
    const [rows] = await connection.query<
      Array<RowDataPacket & { entry_id: string; tag: string }>
    >(
      `
        SELECT entry_id, tag
        FROM memory_entry_tags
        WHERE entry_id IN (${ids.map(() => '?').join(', ')})
      `,
      ids,
    );

    for (const row of rows) {
      const current = result.get(row.entry_id) ?? [];
      current.push(row.tag);
      result.set(row.entry_id, current);
    }

    for (const [entryId, tags] of result.entries()) {
      result.set(entryId, Array.from(new Set(tags)).sort());
    }

    return result;
  }

  private async touchMysqlEntries(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    const pool = await this.mysqlService.getPool();
    await pool.query(
      `
        UPDATE memory_entries
        SET last_accessed_at = ?
        WHERE id IN (${ids.map(() => '?').join(', ')})
      `,
      [this.toMysqlDateTime(new Date()), ...ids],
    );
  }

  private isMissingPath(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    );
  }

  private logMemoryEvent(
    kind: MemoryKind,
    action: MemoryEventAction,
    memoryId: string,
    details?: {
      conversationThreadId?: string | null;
      direction?: string;
      scope?: string;
      sourceRequestId?: string;
      userId?: string;
    },
  ): void {
    this.logger.log(
      [
        `memory.${kind}.${action}`,
        `id=${memoryId}`,
        `thread=${details?.conversationThreadId ?? '-'}`,
        `direction=${details?.direction ?? '-'}`,
        `user_id=${details?.userId ?? '-'}`,
        `scope=${details?.scope ?? '-'}`,
        `source_request_id=${details?.sourceRequestId ?? '-'}`,
      ].join(' '),
    );

    const conversationId = details?.conversationThreadId?.trim();
    if (!conversationId || this.storeDriver() === 'file') {
      return;
    }

    const eventType = `memory.${kind}.${action}` as const;
    void this.assistantMemoryRunEventPublisherService
      .publish(eventType, conversationId, {
        direction: details?.direction ?? 'web',
        id: memoryId,
        kind,
        message: eventType,
        source_request_id: details?.sourceRequestId ?? null,
        scope: details?.scope ?? null,
        user_id: details?.userId ?? 'default-user',
      }, details?.sourceRequestId, details?.direction ?? 'web', details?.userId ?? 'default-user')
      .catch((error) => {
        this.logger.warn(
          `Failed to publish memory event ${eventType} id=${memoryId} conversationId=${conversationId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
  }
}
