import { Test } from '@nestjs/testing';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AssistantMemoryAppModule } from '../src/assistant-memory-app/assistant-memory-app.module';
import { AssistantMemoryEnrichmentService } from '../src/assistant-memory-app/memory/assistant-memory-enrichment.service';
import { AssistantMemoryService } from '../src/assistant-memory-app/memory/assistant-memory.service';

@Injectable()
class DeterministicEnrichmentService {
  constructor(private readonly assistantMemoryService: AssistantMemoryService) {}

  async enqueue(job: { conversation_id: string; request_id: string }): Promise<void> {
    const history = await this.assistantMemoryService.searchConversation({
      conversation_id: job.conversation_id,
      limit: 20,
    });

    const userMessages = history.messages
      .filter((message) => message.role === 'user')
      .map((message) => message.content)
      .join('\n');
    const match = this.extractUserName(userMessages);

    if (!match) {
      return;
    }

    await this.assistantMemoryService.writeByKind(
      'fact',
      `test-enrichment:${job.request_id}:fact`,
      [
        {
          confidence: 0.92,
          content: `User name is ${match}.`,
          conversationThreadId: job.conversation_id,
          scope: 'conversation',
          source: 'assistant-memory-enrichment',
          tags: ['identity', 'name'],
        },
      ],
    );
  }

  private extractUserName(text: string): string | null {
    const cyrillic = text.match(/меня\s+зовут\s+([A-Za-zА-Яа-яЁё-]+)/iu);
    if (cyrillic?.[1]) {
      return cyrillic[1];
    }

    const latin = text.match(/my\s+name\s+is\s+([A-Za-z-]+)/i);
    if (latin?.[1]) {
      return latin[1];
    }

    return null;
  }
}

describe('assistant-memory (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const datadir = await mkdtemp(join(tmpdir(), 'assistant-memory-'));
    const moduleRef = await Test.createTestingModule({
      imports: [AssistantMemoryAppModule],
    })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          ASSISTANT_MEMORY_DATADIR: datadir,
          ASSISTANT_MEMORY_STORE_DRIVER: 'file',
        }),
      )
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns service root and status', async () => {
    const rootResponse = await request(app.getHttpServer()).get('/');
    expect(rootResponse.status).toBe(200);
    expect(rootResponse.text).toContain('assistant-memory');
    expect(rootResponse.text).toContain('Durable memory service');
    expect(rootResponse.text).toContain('/v1/profile');

    const statusResponse = await request(app.getHttpServer()).get('/status');
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body).toEqual({
      ready: true,
      service: 'assistant-memory',
      status: 'ok',
      uptime_seconds: expect.any(Number),
    });
  });

  it('stores profile and typed memory entries and supports federated search/archive', async () => {
    const profileResponse = await request(app.getHttpServer())
      .put('/v1/profile')
      .send({
        language: 'en',
        preferences: {
          response_style: 'concise',
        },
        source: 'assistant-orchestrator',
        timezone: 'Europe/Warsaw',
      });

    expect(profileResponse.status).toBe(200);
    expect(profileResponse.body.updatedProfile.language).toBe('en');

    const preferenceWriteResponse = await request(app.getHttpServer())
      .post('/v1/preferences/write')
      .set('Idempotency-Key', 'memory-write-1')
      .send({
        entries: [
          {
            confidence: 0.92,
            content: 'Alex prefers concise replies.',
            conversationThreadId: 'thread_1',
            scope: 'conversation',
            source: 'assistant-orchestrator',
            tags: ['api', 'style'],
          },
        ],
      });

    expect(preferenceWriteResponse.status).toBe(200);
    expect(preferenceWriteResponse.body.created).toBe(1);
    const preferenceId = preferenceWriteResponse.body.entries[0]?.id as string;

    const episodeWriteResponse = await request(app.getHttpServer())
      .post('/v1/episodes/write')
      .set('Idempotency-Key', 'memory-write-2')
      .send({
        entries: [
          {
            confidence: 0.91,
            content: 'On 2026-03-27, callbacks were assigned only to assistant-api.',
            conversationThreadId: 'thread_1',
            scope: 'architecture',
            source: 'assistant-orchestrator',
            tags: ['architecture', 'callbacks'],
          },
        ],
      });

    expect(episodeWriteResponse.status).toBe(200);
    expect(episodeWriteResponse.body.created).toBe(1);

    const typedSearchResponse = await request(app.getHttpServer())
      .post('/v1/preferences/search')
      .send({
        conversationThreadId: 'thread_1',
        query: 'concise replies',
      });

    expect(typedSearchResponse.status).toBe(200);
    expect(typedSearchResponse.body.count).toBe(1);
    expect(typedSearchResponse.body.entries[0]?.content).toBe('Alex prefers concise replies.');
    expect(typedSearchResponse.body.entries[0]?.kind).toBe('preference');

    const federatedSearchResponse = await request(app.getHttpServer())
      .post('/v1/search')
      .send({
        conversationThreadId: 'thread_1',
        query: 'callbacks',
      });

    expect(federatedSearchResponse.status).toBe(200);
    expect(federatedSearchResponse.body.count).toBeGreaterThanOrEqual(1);
    expect(
      federatedSearchResponse.body.entries.some(
        (entry: { kind?: string; reason?: string }) =>
          entry.kind === 'episode' && typeof entry.reason === 'string' && entry.reason.includes('match'),
      ),
    ).toBe(true);

    const getResponse = await request(app.getHttpServer()).get(`/v1/preferences/${preferenceId}`);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.id).toBe(preferenceId);

    const archiveResponse = await request(app.getHttpServer()).post(
      `/v1/preferences/${preferenceId}/archive`,
    );
    expect(archiveResponse.status).toBe(200);
    expect(archiveResponse.body.status).toBe('archived');
    expect(archiveResponse.body.kind).toBe('preference');
  });
});

describe('assistant-memory fact extraction from conversation (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const datadir = await mkdtemp(join(tmpdir(), 'assistant-memory-conversation-facts-'));
    const moduleRef = await Test.createTestingModule({
      imports: [AssistantMemoryAppModule],
    })
      .overrideProvider(ConfigService)
      .useValue(
        new ConfigService({
          ASSISTANT_MEMORY_DATADIR: datadir,
          ASSISTANT_MEMORY_STORE_DRIVER: 'file',
        }),
      )
      .overrideProvider(AssistantMemoryEnrichmentService)
      .useClass(DeterministicEnrichmentService)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('extracts fact from conversation append when request_id is provided', async () => {
    const conversationId = 'thread_fact_extract_1';
    const appendResponse = await request(app.getHttpServer())
      .post('/v1/conversations/append')
      .send({
        chat: 'web',
        user_id: 'default-user',
        conversation_id: conversationId,
        direction: 'web',
        message: 'меня зовут Дмитрий',
        reply: {
          context: 'Пользователь представился.',
          message: 'Приятно познакомиться, Дмитрий.',
        },
        request_id: 'req_fact_extract_1',
      });

    expect(appendResponse.status).toBe(200);
    expect(appendResponse.body.messages).toHaveLength(2);

    const factsResponse = await request(app.getHttpServer())
      .post('/v1/facts/search')
      .send({
        conversationThreadId: conversationId,
        query: 'Дмитрий',
      });

    expect(factsResponse.status).toBe(200);
    expect(factsResponse.body.count).toBeGreaterThanOrEqual(1);
    expect(
      factsResponse.body.entries.some(
        (entry: { content?: string; kind?: string; source?: string }) =>
          entry.kind === 'fact' &&
          entry.source === 'assistant-memory-enrichment' &&
          typeof entry.content === 'string' &&
          entry.content.includes('Дмитрий'),
      ),
    ).toBe(true);
  });

  it('extracts fact from conversation append even without request_id', async () => {
    const conversationId = 'thread_fact_extract_2';
    const appendResponse = await request(app.getHttpServer())
      .post('/v1/conversations/append')
      .send({
        chat: 'web',
        user_id: 'default-user',
        conversation_id: conversationId,
        direction: 'web',
        message: 'меня зовут Алексей',
        reply: {
          context: '',
          message: 'Хорошо.',
        },
      });

    expect(appendResponse.status).toBe(200);

    const factsResponse = await request(app.getHttpServer())
      .post('/v1/facts/search')
      .send({
        conversationThreadId: conversationId,
        query: 'Алексей',
      });

    expect(factsResponse.status).toBe(200);
    expect(factsResponse.body.count).toBeGreaterThanOrEqual(1);
    expect(
      factsResponse.body.entries.some(
        (entry: { content?: string; kind?: string; source?: string }) =>
          entry.kind === 'fact' &&
          entry.source === 'assistant-memory-enrichment' &&
          typeof entry.content === 'string' &&
          entry.content.includes('Алексей'),
      ),
    ).toBe(true);
  });
});
