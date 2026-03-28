import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AssistantMemoryAppModule } from '../src/assistant-memory-app/assistant-memory-app.module';

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
        source: 'assistant-worker',
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
            source: 'assistant-worker',
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
            source: 'assistant-worker',
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
