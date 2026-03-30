import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AssistantSchedulerConfig,
  AssistantSchedulerJob,
  AssistantSchedulerJobCreateRequest,
  AssistantSchedulerJobUpdateRequest,
} from "../contracts/assistant-scheduler";
import { AssistantSchedulerConfigService } from "./assistant-scheduler-config.service";

interface SchedulerStore {
  jobs: AssistantSchedulerJob[];
}

@Injectable()
export class AssistantSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AssistantSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private dispatching = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly assistantSchedulerConfigService: AssistantSchedulerConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureStoreExists();
    if (this.internalLoopEnabled()) {
      await this.startLoop();
      this.logger.log("Internal scheduler loop started");
      return;
    }
    this.logger.log("Internal scheduler loop disabled; external trigger mode enabled");
  }

  onModuleDestroy(): void {
    this.stopLoop();
  }

  async listJobs(): Promise<AssistantSchedulerJob[]> {
    return (await this.readStore()).jobs;
  }

  async getJob(jobId: string): Promise<AssistantSchedulerJob> {
    const job = (await this.readStore()).jobs.find((entry) => entry.id === jobId);
    if (!job) {
      throw new NotFoundException(`Job not found: ${jobId}`);
    }
    return job;
  }

  async createJob(
    body: AssistantSchedulerJobCreateRequest,
  ): Promise<AssistantSchedulerJob> {
    this.validateCreate(body);
    const now = new Date();
    const job: AssistantSchedulerJob = {
      chat: body.chat.trim(),
      conversation_id: body.conversation_id.trim(),
      created_at: now.toISOString(),
      direction: body.direction.trim(),
      enabled: body.enabled ?? true,
      every_seconds: Math.floor(body.every_seconds),
      id: randomUUID().replaceAll("-", ""),
      last_error: null,
      last_request_id: null,
      last_run_at: null,
      message: body.message.trim(),
      name: body.name.trim(),
      next_run_at: new Date(
        now.getTime() + Math.floor(body.every_seconds) * 1000,
      ).toISOString(),
      updated_at: now.toISOString(),
      user_id: body.user_id.trim(),
    };
    const store = await this.readStore();
    store.jobs.push(job);
    await this.writeStore(store);
    return job;
  }

  async updateJob(
    jobId: string,
    body: AssistantSchedulerJobUpdateRequest,
  ): Promise<AssistantSchedulerJob> {
    const store = await this.readStore();
    const index = store.jobs.findIndex((entry) => entry.id === jobId);
    if (index < 0) {
      throw new NotFoundException(`Job not found: ${jobId}`);
    }

    const current = store.jobs[index];
    const next: AssistantSchedulerJob = {
      ...current,
      chat: body.chat === undefined ? current.chat : this.requireNonEmpty("chat", body.chat),
      conversation_id:
        body.conversation_id === undefined
          ? current.conversation_id
          : this.requireNonEmpty("conversation_id", body.conversation_id),
      direction:
        body.direction === undefined
          ? current.direction
          : this.requireNonEmpty("direction", body.direction),
      enabled: body.enabled === undefined ? current.enabled : body.enabled,
      every_seconds:
        body.every_seconds === undefined
          ? current.every_seconds
          : this.requireEverySeconds(body.every_seconds),
      message:
        body.message === undefined
          ? current.message
          : this.requireNonEmpty("message", body.message),
      name:
        body.name === undefined ? current.name : this.requireNonEmpty("name", body.name),
      updated_at: new Date().toISOString(),
      user_id:
        body.user_id === undefined
          ? current.user_id
          : this.requireNonEmpty("user_id", body.user_id),
    };

    if (body.enabled === true && current.enabled === false) {
      next.next_run_at = new Date(
        Date.now() + next.every_seconds * 1000,
      ).toISOString();
      next.last_error = null;
    }
    if (body.every_seconds !== undefined && next.enabled) {
      next.next_run_at = new Date(
        Date.now() + next.every_seconds * 1000,
      ).toISOString();
    }

    store.jobs[index] = next;
    await this.writeStore(store);
    return next;
  }

  async deleteJob(jobId: string): Promise<{ status: "deleted" }> {
    const store = await this.readStore();
    const index = store.jobs.findIndex((entry) => entry.id === jobId);
    if (index < 0) {
      throw new NotFoundException(`Job not found: ${jobId}`);
    }
    store.jobs.splice(index, 1);
    await this.writeStore(store);
    return { status: "deleted" };
  }

  async runJobNow(jobId: string): Promise<AssistantSchedulerJob> {
    const store = await this.readStore();
    const index = store.jobs.findIndex((entry) => entry.id === jobId);
    if (index < 0) {
      throw new NotFoundException(`Job not found: ${jobId}`);
    }
    const current = store.jobs[index];
    const [updated] = await this.dispatch([current], await this.assistantSchedulerConfigService.read());
    store.jobs[index] = updated;
    await this.writeStore(store);
    return updated;
  }

  async dispatchDueNow(): Promise<{ dispatched: number }> {
    const dispatched = await this.processDueJobsOnce();
    return { dispatched };
  }

  private async startLoop(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    const config = await this.assistantSchedulerConfigService.read();
    this.timer = setInterval(() => {
      void this.tick();
    }, Math.max(250, config.poll_interval_ms));
    this.timer.unref?.();
  }

  private stopLoop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    await this.processDueJobsOnce();
  }

  private async processDueJobsOnce(): Promise<number> {
    if (this.dispatching) {
      return 0;
    }
    this.dispatching = true;
    try {
      const [store, config] = await Promise.all([
        this.readStore(),
        this.assistantSchedulerConfigService.read(),
      ]);
      const now = Date.now();
      const due = store.jobs.filter((job) => {
        if (!job.enabled) {
          return false;
        }
        const dueAt = Date.parse(job.next_run_at);
        return Number.isFinite(dueAt) && dueAt <= now;
      });
      if (due.length === 0) {
        return 0;
      }
      const updatedJobs = await this.dispatch(due, config);
      const byId = new Map(updatedJobs.map((entry) => [entry.id, entry]));
      store.jobs = store.jobs.map((job) => byId.get(job.id) ?? job);
      await this.writeStore(store);
      return due.length;
    } catch (error) {
      this.logger.warn(
        `scheduler tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    } finally {
      this.dispatching = false;
    }
  }

  private async dispatch(
    jobs: AssistantSchedulerJob[],
    config: AssistantSchedulerConfig,
  ): Promise<AssistantSchedulerJob[]> {
    const updated: AssistantSchedulerJob[] = [];
    for (const job of jobs) {
      const nowIso = new Date().toISOString();
      const nextBase = Date.now() + job.every_seconds * 1000;
      try {
        const response = await fetch(
          `${config.assistant_api_url}/conversation/${encodeURIComponent(job.direction)}/${encodeURIComponent(job.chat)}/${encodeURIComponent(job.user_id)}`,
          {
            body: JSON.stringify({
              conversation_id: job.conversation_id,
              message: job.message,
            }),
            headers: { "content-type": "application/json" },
            method: "POST",
            signal: AbortSignal.timeout(15_000),
          },
        );
        if (!response.ok) {
          const body = await response.text();
          throw new Error(`assistant-api ${String(response.status)} ${body}`);
        }
        const payload = (await response.json()) as { request_id?: string };
        updated.push({
          ...job,
          last_error: null,
          last_request_id:
            typeof payload.request_id === "string" ? payload.request_id : null,
          last_run_at: nowIso,
          next_run_at: new Date(nextBase).toISOString(),
          updated_at: nowIso,
        });
      } catch (error) {
        updated.push({
          ...job,
          last_error: error instanceof Error ? error.message : String(error),
          last_run_at: nowIso,
          next_run_at: new Date(nextBase).toISOString(),
          updated_at: nowIso,
        });
      }
    }
    return updated;
  }

  private validateCreate(body: AssistantSchedulerJobCreateRequest): void {
    this.requireNonEmpty("name", body.name);
    this.requireNonEmpty("direction", body.direction);
    this.requireNonEmpty("chat", body.chat);
    this.requireNonEmpty("user_id", body.user_id);
    this.requireNonEmpty("conversation_id", body.conversation_id);
    this.requireNonEmpty("message", body.message);
    this.requireEverySeconds(body.every_seconds);
  }

  private requireNonEmpty(field: string, value: string): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new BadRequestException(`${field} must not be empty`);
    }
    return value.trim();
  }

  private requireEverySeconds(value: number): number {
    if (!Number.isFinite(value) || value < 5) {
      throw new BadRequestException("every_seconds must be >= 5");
    }
    return Math.floor(value);
  }

  private async ensureStoreExists(): Promise<void> {
    const path = this.jobsPath();
    try {
      await readFile(path, "utf8");
    } catch (error) {
      if (!this.isMissingPath(error)) {
        throw error;
      }
      await mkdir(this.jobsDirectory(), { recursive: true });
      await writeFile(path, `${JSON.stringify({ jobs: [] }, null, 2)}\n`, "utf8");
    }
  }

  private async readStore(): Promise<SchedulerStore> {
    await this.ensureStoreExists();
    const content = await readFile(this.jobsPath(), "utf8");
    const parsed = JSON.parse(content) as Partial<SchedulerStore>;
    const jobs = Array.isArray(parsed.jobs)
      ? parsed.jobs.filter(
          (entry): entry is AssistantSchedulerJob =>
            typeof entry === "object" && entry !== null && typeof (entry as { id?: unknown }).id === "string",
        )
      : [];
    return { jobs };
  }

  private async writeStore(store: SchedulerStore): Promise<void> {
    await mkdir(this.jobsDirectory(), { recursive: true });
    await writeFile(this.jobsPath(), `${JSON.stringify(store, null, 2)}\n`, "utf8");
  }

  private jobsPath(): string {
    return join(this.jobsDirectory(), "jobs.json");
  }

  private jobsDirectory(): string {
    return join(this.runtimeDirectory(), "jobs");
  }

  private runtimeDirectory(): string {
    return this.configService.get<string>(
      "ASSISTANT_SCHEDULER_RUNTIME_DIR",
      join(process.cwd(), "runtime", "assistant-scheduler"),
    );
  }

  private internalLoopEnabled(): boolean {
    const raw = this.configService.get<string>(
      "ASSISTANT_SCHEDULER_INTERNAL_LOOP",
      "true",
    );
    return raw.trim().toLowerCase() !== "false";
  }

  private isMissingPath(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    );
  }
}
