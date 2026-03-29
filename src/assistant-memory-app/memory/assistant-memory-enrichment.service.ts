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
  ConversationMessage,
} from "../../contracts/assistant-memory";
import type { AssistantLlmMessage } from "../../contracts/assistant-llm";
import { AssistantMemoryConfigService } from "../assistant-memory-config.service";
import { AssistantMemoryRunEventPublisherService } from "../run-events/assistant-memory-run-event-publisher.service";
import { AssistantMemoryLlmClientService } from "./assistant-memory-llm-client.service";
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
    private readonly assistantMemoryLlmClientService: AssistantMemoryLlmClientService,
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
    const facts = await this.extractFacts(
      job.conversation_id,
      messages,
    );
    await this.applyFacts(job, facts);
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

  private async extractFacts(
    conversationId: string,
    messages: AssistantLlmMessage[],
  ): Promise<string[]> {
    const extracted = await this.assistantMemoryLlmClientService.extractFacts(
      conversationId,
      messages,
    );
    this.logger.debug(
      `Enrichment extract payload conversation_id=${conversationId} extract=fact payload=${this.preview(extracted)}`,
    );
    this.logger.debug(
      `Enrichment extract response conversation_id=${conversationId} extract=fact items=${extracted.length}`,
    );
    return extracted;
  }

  private async applyFacts(job: EnrichmentJob, facts: string[]): Promise<void> {
    if (facts.length === 0) {
      this.logger.debug(
        `Enrichment facts skipped request_id=${job.request_id} conversation_id=${job.conversation_id} extract=fact candidates=0`,
      );
      return;
    }

    const normalized = facts.map((content) => ({
      confidence: 0.8,
      content,
      conversationThreadId: job.conversation_id,
      scope: "conversation",
      source: "assistant-memory-enrichment",
      tags: [],
    }));
    this.logger.debug(
      `Enrichment fact candidates request_id=${job.request_id} conversation_id=${job.conversation_id} normalized=${this.preview(normalized)}`,
    );
    const result = await this.assistantMemoryService.writeByKind(
      "fact",
      `enrichment:${job.request_id}:fact`,
      normalized,
      {
        direction: job.direction,
        sourceRequestId: job.request_id,
        userId: job.user_id,
      },
    );
    this.logger.debug(
      `Enrichment facts applied request_id=${job.request_id} conversation_id=${job.conversation_id} candidates=${facts.length} created=${result.created} updated=${result.updated}`,
    );
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
