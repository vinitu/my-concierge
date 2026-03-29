import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type {
  BaseMemoryWriteCandidate,
  FederatedMemorySearchRequest,
  MemoryEntry,
  MemoryKind,
  MemorySearchResponse,
  TypedMemorySearchRequest,
  MemoryWriteCandidate,
  MemoryWriteResult,
} from '../../contracts/assistant-memory';

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

@Injectable()
export class AssistantMemoryClientService {
  private readonly logger = new Logger(AssistantMemoryClientService.name);

  constructor(private readonly configService: ConfigService) {}

  async searchFederated(
    query: string,
    conversationThreadId: string,
  ): Promise<MemorySearchResponse> {
    const body: FederatedMemorySearchRequest = {
      conversationThreadId,
      limit: 8,
      query,
    };
    return this.postSearch('/v1/search', body);
  }

  async searchByKind(
    kind: MemoryKind,
    query: string,
    conversationThreadId: string,
  ): Promise<MemorySearchResponse> {
    const body: TypedMemorySearchRequest = {
      conversationThreadId,
      limit: 8,
      query,
    };
    return this.postSearch(`/v1/${this.kindResource(kind)}/search`, body);
  }

  async writeByKind(
    kind: MemoryKind,
    entries: BaseMemoryWriteCandidate[],
  ): Promise<MemoryWriteResult | null> {
    if (entries.length === 0) {
      return null;
    }

    const baseUrl = this.baseUrl();
    const response = await fetch(`${baseUrl}/v1/${this.kindResource(kind)}/write`, {
      body: JSON.stringify({
        entries,
      }),
      headers: {
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`assistant-memory returned ${response.status} for ${kind} write`);
    }

    return (await response.json()) as MemoryWriteResult;
  }

  async search(query: string, conversationThreadId: string): Promise<MemorySearchResponse> {
    return this.searchFederated(query, conversationThreadId);
  }

  async write(entries: MemoryWriteCandidate[]): Promise<MemoryWriteResult | null> {
    if (entries.length === 0) {
      return null;
    }

    const grouped = this.groupByKind(entries);
    let created = 0;
    let updated = 0;
    const savedEntries: MemoryEntry[] = [];

    for (const [kind, kindEntries] of grouped.entries()) {
      const payload = await this.writeByKind(
        kind,
        kindEntries.map(({ kind: ignored, ...entry }) => entry),
      );

      if (!payload) {
        continue;
      }

      created += payload.created;
      updated += payload.updated;
      savedEntries.push(...payload.entries);
    }

    return {
      created,
      entries: savedEntries,
      updated,
    };
  }

  async safeSearch(query: string, conversationThreadId: string): Promise<MemorySearchResponse> {
    try {
      return await this.search(query, conversationThreadId);
    } catch (error) {
      this.logger.warn(
        `assistant-memory search failed for ${conversationThreadId}: ${this.errorMessage(error)}`,
      );
      return {
        count: 0,
        entries: [],
      };
    }
  }

  async safeWrite(entries: MemoryWriteCandidate[]): Promise<void> {
    try {
      await this.write(entries);
    } catch (error) {
      this.logger.warn(`assistant-memory write failed: ${this.errorMessage(error)}`);
    }
  }

  private async postSearch(
    path: string,
    body: FederatedMemorySearchRequest | TypedMemorySearchRequest,
  ): Promise<MemorySearchResponse> {
    const baseUrl = this.baseUrl();

    const response = await fetch(`${baseUrl}${path}`, {
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`assistant-memory returned ${response.status} for search`);
    }

    return (await response.json()) as MemorySearchResponse;
  }

  private baseUrl(): string {
    return trimTrailingSlash(
      this.configService.get<string>('ASSISTANT_MEMORY_URL', 'http://localhost:8086'),
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private groupByKind(entries: MemoryWriteCandidate[]): Map<MemoryKind, MemoryWriteCandidate[]> {
    const grouped = new Map<MemoryKind, MemoryWriteCandidate[]>();

    for (const entry of entries) {
      const current = grouped.get(entry.kind) ?? [];
      current.push(entry);
      grouped.set(entry.kind, current);
    }

    return grouped;
  }

  private kindResource(kind: MemoryKind): string {
    switch (kind) {
      case 'fact':
        return 'facts';
      default:
        throw new Error(`Unsupported memory kind for assistant-memory API: ${kind}`);
    }
  }
}
