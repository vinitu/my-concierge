import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type {
  FederatedMemorySearchRequest,
  MemoryEntry,
  MemoryKind,
  MemorySearchResponse,
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

  async search(query: string, conversationThreadId: string): Promise<MemorySearchResponse> {
    const body: FederatedMemorySearchRequest = {
      conversationThreadId,
      limit: 8,
      query,
    };
    const baseUrl = trimTrailingSlash(
      this.configService.get<string>('ASSISTANT_MEMORY_URL', 'http://localhost:3002'),
    );
    const response = await fetch(`${baseUrl}/v1/search`, {
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

  async write(entries: MemoryWriteCandidate[]): Promise<MemoryWriteResult | null> {
    if (entries.length === 0) {
      return null;
    }

    const baseUrl = trimTrailingSlash(
      this.configService.get<string>('ASSISTANT_MEMORY_URL', 'http://localhost:3002'),
    );
    const grouped = this.groupByKind(entries);
    let created = 0;
    let updated = 0;
    const savedEntries: MemoryEntry[] = [];

    for (const [kind, kindEntries] of grouped.entries()) {
      const response = await fetch(`${baseUrl}/v1/${this.kindResource(kind)}/write`, {
        body: JSON.stringify({
          entries: kindEntries.map(({ kind: ignored, ...entry }) => entry),
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

      const payload = (await response.json()) as MemoryWriteResult;
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
      case 'preference':
        return 'preferences';
      case 'fact':
        return 'facts';
      case 'routine':
        return 'routines';
      case 'project':
        return 'projects';
      case 'episode':
        return 'episodes';
      case 'rule':
        return 'rules';
    }
  }
}
