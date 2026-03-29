import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type RedisClientType } from "redis";
import type {
  AssistantMemoryExtractKind,
  BaseMemoryWriteCandidate,
  ConversationMessage,
  MemoryKind,
} from "../../contracts/assistant-memory";
import type {
  AssistantLlmExtractMemoryResponse,
  AssistantLlmMessage,
} from "../../contracts/assistant-llm";
import { AssistantMemoryConfigService } from "../assistant-memory-config.service";
import { AssistantMemoryRunEventPublisherService } from "../run-events/assistant-memory-run-event-publisher.service";
import { AssistantMemoryService } from "./assistant-memory.service";

interface EnrichmentJob {
  chat: string;
  conversation_id: string;
  direction: string;
  extract: AssistantMemoryExtractKind;
  request_id: string;
  user_id: string;
}

type EnrichmentEnqueueInput = Omit<EnrichmentJob, "extract">;

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

@Injectable()
export class AssistantMemoryEnrichmentService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AssistantMemoryEnrichmentService.name);
  private client: RedisClientType | null = null;
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly assistantMemoryConfigService: AssistantMemoryConfigService,
    private readonly assistantMemoryRunEventPublisherService: AssistantMemoryRunEventPublisherService,
    private readonly assistantMemoryService: AssistantMemoryService,
  ) {}

  onModuleInit(): void {
    const intervalMs = Number.parseInt(
      this.configService.get<string>(
        "ASSISTANT_MEMORY_ENRICHMENT_POLL_MS",
        "1000",
      ),
      10,
    );
    this.timer = setInterval(
      () => {
        void this.processOnce();
      },
      Math.max(250, intervalMs),
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }

  async enqueue(job: EnrichmentEnqueueInput): Promise<void> {
    const client = await this.getClient();
    const config = await this.assistantMemoryConfigService.read();
    const jobs = config.enabled_extracts.map((extract) => ({
      ...job,
      extract,
    }));

    for (const nextJob of jobs) {
      await client.rPush(this.queueName(), JSON.stringify(nextJob));
      this.logger.debug(
        `Enrichment enqueued request_id=${nextJob.request_id} conversation_id=${nextJob.conversation_id} extract=${nextJob.extract}`,
      );
    }
  }

  private async processOnce(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;
    try {
      const client = await this.getClient();
      const payload = await client.brPop(this.queueName(), 1);

      if (!payload?.element) {
        return;
      }

      const job = JSON.parse(payload.element) as EnrichmentJob;
      const alreadyDone = await client.set(
        this.requestKey(job.request_id, job.extract),
        "1",
        {
          EX: 60 * 60 * 24 * 7,
          NX: true,
        },
      );

      if (alreadyDone !== "OK") {
        this.logger.debug(
          `Skipping duplicate enrichment request_id=${job.request_id} conversation_id=${job.conversation_id} extract=${job.extract}`,
        );
        return;
      }

      try {
        await this.publishExtractEvent("started", job);
        await this.processJob(job);
        await this.publishExtractEvent("completed", job);
      } catch (error) {
        await this.publishExtractEvent("failed", job, {
          error: error instanceof Error ? error.message : String(error),
        });
        this.logger.warn(
          `Enrichment job failed request_id=${job.request_id} conversation_id=${job.conversation_id} extract=${job.extract}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Enrichment processing failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.processing = false;
    }
  }

  private async processJob(job: EnrichmentJob): Promise<void> {
    this.logger.debug(
      `Enrichment job start request_id=${job.request_id} conversation_id=${job.conversation_id} extract=${job.extract}`,
    );
    const history = await this.assistantMemoryService.searchConversation({
      conversation_id: job.conversation_id,
      limit: 40,
    });
    this.logger.debug(
      `Enrichment history loaded request_id=${job.request_id} conversation_id=${job.conversation_id} extract=${job.extract} messages=${history.messages.length}`,
    );
    const messages = history.messages.map((message) =>
      this.mapConversationMessage(message),
    );
    const extracted = await this.extractMemory(
      job.conversation_id,
      job.extract,
      messages,
    );

    await this.applyProfilePatch(extracted);
    await this.applyTypedWrites(job, extracted);
    this.logger.debug(
      `Enrichment job completed request_id=${job.request_id} conversation_id=${job.conversation_id} extract=${job.extract}`,
    );
  }

  private mapConversationMessage(
    message: ConversationMessage,
  ): AssistantLlmMessage {
    return {
      content: message.content,
      role: message.role,
    };
  }

  private async extractMemory(
    conversationId: string,
    extract: AssistantMemoryExtractKind,
    messages: AssistantLlmMessage[],
  ): Promise<AssistantLlmExtractMemoryResponse> {
    this.logger.debug(
      `Enrichment extract request conversation_id=${conversationId} extract=${extract} messages=${messages.length}`,
    );
    const response = await fetch(
      `${this.assistantLlmBaseUrl()}/v1/generate/extract-memory`,
      {
        body: JSON.stringify({
          conversation_id: conversationId,
          extract,
          messages,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(this.enrichmentTimeoutMs()),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `assistant-llm returned ${String(response.status)} for /v1/generate/extract-memory: ${body}`,
      );
    }

    const extracted =
      (await response.json()) as AssistantLlmExtractMemoryResponse;
    this.logger.debug(
      `Enrichment extract payload conversation_id=${conversationId} extract=${extract} payload=${this.preview(extracted)}`,
    );
    const typedCounts = {
      episode: extracted.typed_writes.episode?.length ?? 0,
      fact: extracted.typed_writes.fact?.length ?? 0,
      preference: extracted.typed_writes.preference?.length ?? 0,
      project: extracted.typed_writes.project?.length ?? 0,
      routine: extracted.typed_writes.routine?.length ?? 0,
      rule: extracted.typed_writes.rule?.length ?? 0,
    };
    this.logger.debug(
      `Enrichment extract response conversation_id=${conversationId} extract=${extract} profile_patch_keys=${
        Object.keys(extracted.profile_patch ?? {}).length
      } typed_counts=${JSON.stringify(typedCounts)}`,
    );
    return extracted;
  }

  private async applyProfilePatch(
    extracted: AssistantLlmExtractMemoryResponse,
  ): Promise<void> {
    const patch = extracted.profile_patch;
    if (Object.keys(patch).length === 0) {
      this.logger.debug("Enrichment profile patch skipped (empty)");
      return;
    }
    await this.assistantMemoryService.updateProfile({
      ...patch,
      source: "assistant-memory-enrichment",
    });
    this.logger.debug(
      `Enrichment profile patch applied keys=${Object.keys(patch).join(",") || "(none)"}`,
    );
  }

  private async applyTypedWrites(
    job: EnrichmentJob,
    extracted: AssistantLlmExtractMemoryResponse,
  ): Promise<void> {
    const byKind: Record<MemoryKind, BaseMemoryWriteCandidate[]> = {
      episode: extracted.typed_writes.episode ?? [],
      fact: extracted.typed_writes.fact ?? [],
      preference: extracted.typed_writes.preference ?? [],
      project: extracted.typed_writes.project ?? [],
      routine: extracted.typed_writes.routine ?? [],
      rule: extracted.typed_writes.rule ?? [],
    };

    for (const [kind, candidates] of Object.entries(byKind) as Array<
      [MemoryKind, BaseMemoryWriteCandidate[]]
    >) {
      if (candidates.length === 0) {
        this.logger.debug(
          `Enrichment typed writes skipped request_id=${job.request_id} conversation_id=${job.conversation_id} extract=${job.extract} kind=${kind} candidates=0`,
        );
        continue;
      }

      const normalized = candidates.map((candidate) => ({
        confidence: Math.min(0.99, Math.max(0.5, candidate.confidence)),
        content: candidate.content,
        conversationThreadId:
          candidate.conversationThreadId ?? job.conversation_id,
        scope: candidate.scope || "conversation",
        source: candidate.source || "assistant-memory-enrichment",
        tags: candidate.tags ?? [],
      }));
      this.logger.debug(
        `Enrichment typed write candidates request_id=${job.request_id} conversation_id=${job.conversation_id} extract=${job.extract} kind=${kind} normalized=${this.preview(normalized)}`,
      );
      const result = await this.assistantMemoryService.writeByKind(
        kind,
        `enrichment:${job.request_id}:${kind}`,
        normalized,
        {
          direction: job.direction,
          sourceRequestId: job.request_id,
          userId: job.user_id,
        },
      );
      this.logger.debug(
        `Enrichment typed writes applied request_id=${job.request_id} conversation_id=${job.conversation_id} extract=${job.extract} kind=${kind} candidates=${candidates.length} created=${result.created} updated=${result.updated}`,
      );
    }
  }

  private async getClient(): Promise<RedisClientType> {
    if (!this.client) {
      this.client = createClient({
        url: this.configService.get<string>(
          "REDIS_URL",
          "redis://127.0.0.1:6379",
        ),
      });
      await this.client.connect();
    }
    return this.client;
  }

  private queueName(): string {
    return this.configService.get<string>(
      "REDIS_MEMORY_ENRICHMENT_QUEUE_NAME",
      "assistant:memory:enrichment",
    );
  }

  private requestKey(
    requestId: string,
    extract: AssistantMemoryExtractKind,
  ): string {
    return `assistant:memory:enrichment:request:${requestId}:${extract}`;
  }

  private assistantLlmBaseUrl(): string {
    return trimTrailingSlash(
      this.configService.get<string>(
        "ASSISTANT_LLM_URL",
        "http://assistant-llm:3000",
      ),
    );
  }

  private enrichmentTimeoutMs(): number {
    return Number.parseInt(
      this.configService.get<string>(
        "ASSISTANT_MEMORY_ENRICHMENT_TIMEOUT_MS",
        "30000",
      ),
      10,
    );
  }

  private preview(value: unknown): string {
    const serialized = JSON.stringify(value, null, 2);
    return serialized.length > 4000
      ? `${serialized.slice(0, 4000)}…`
      : serialized;
  }

  private async publishExtractEvent(
    stage: "completed" | "failed" | "started",
    job: EnrichmentJob,
    extraPayload?: Record<string, unknown>,
  ): Promise<void> {
    if (
      this.configService.get<string>(
        "ASSISTANT_MEMORY_STORE_DRIVER",
        "mysql",
      ) === "file"
    ) {
      return;
    }

    const eventType = `memory.extract.${stage}` as const;
    const payload: Record<string, unknown> = {
      extract: job.extract,
      message: eventType,
      request_id: job.request_id,
      ...extraPayload,
    };

    try {
      await this.assistantMemoryRunEventPublisherService.publish(
        eventType,
        job.conversation_id,
        payload,
        job.request_id,
        job.direction,
        job.user_id,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to publish enrichment event event=${eventType} request_id=${job.request_id} conversation_id=${job.conversation_id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
