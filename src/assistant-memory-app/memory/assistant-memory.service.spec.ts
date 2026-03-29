import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MysqlService } from '../../persistence/mysql.service';
import { AssistantMemoryMetricsService } from '../observability/assistant-memory-metrics.service';
import { AssistantMemoryRunEventPublisherService } from '../run-events/assistant-memory-run-event-publisher.service';
import { AssistantMemoryService } from './assistant-memory.service';

describe('AssistantMemoryService', () => {
  async function createService(): Promise<AssistantMemoryService> {
    const datadir = await mkdtemp(join(tmpdir(), 'assistant-memory-service-'));

    return new AssistantMemoryService(
      new ConfigService({
        ASSISTANT_MEMORY_DATADIR: datadir,
        ASSISTANT_MEMORY_STORE_DRIVER: 'file',
      }),
      new AssistantMemoryMetricsService(),
      {} as MysqlService,
      {
        publish: jest.fn(),
      } as unknown as AssistantMemoryRunEventPublisherService,
    );
  }

  it('rejects preference candidates that look like episodes', async () => {
    const service = await createService();

    await expect(
      service.writeByKind('preference', 'idempotency-1', [
        {
          confidence: 0.91,
          content: 'On 2026-03-27, we decided to use concise replies.',
          scope: 'conversation',
          source: 'assistant-orchestrator',
        },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects episode candidates that are only greeting noise', async () => {
    const service = await createService();

    await expect(
      service.writeByKind('episode', 'idempotency-greeting-noise', [
        {
          confidence: 0.91,
          content: 'User said "привет" in Russian.',
          scope: 'conversation',
          source: 'assistant-orchestrator',
        },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates existing fact entries instead of creating duplicates', async () => {
    const service = await createService();

    const first = await service.writeByKind('fact', 'idempotency-2', [
      {
        confidence: 0.82,
        content: 'Uses a Synology NAS at home.',
        scope: 'global',
        source: 'assistant-orchestrator',
        tags: ['home'],
      },
    ]);
    const second = await service.writeByKind('fact', 'idempotency-3', [
      {
        confidence: 0.95,
        content: 'Uses a Synology NAS at home.',
        scope: 'global',
        source: 'assistant-orchestrator',
        tags: ['infra'],
      },
    ]);

    expect(first.created).toBe(1);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(1);
    expect(second.entries[0]?.confidence).toBe(0.95);
    expect(second.entries[0]?.tags).toEqual(['home', 'infra']);
  });

  it('returns federated search results across kinds and excludes archived entries', async () => {
    const service = await createService();

    const preference = await service.writeByKind('preference', 'idempotency-4', [
      {
        confidence: 0.91,
        content: 'Prefers concise replies.',
        scope: 'conversation',
        source: 'assistant-orchestrator',
      },
    ]);
    await service.writeByKind('rule', 'idempotency-5', [
      {
        confidence: 0.98,
        content: 'Only assistant-api may deliver external callbacks.',
        scope: 'architecture',
        source: 'assistant-orchestrator',
      },
    ]);

    await service.archiveByKind('preference', preference.entries[0]!.id);
    const result = await service.search({
      query: 'callbacks',
    });

    expect(result.count).toBe(1);
    expect(result.entries[0]?.kind).toBe('rule');
  });
});
