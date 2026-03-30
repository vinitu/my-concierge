import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AssistantSchedulerConfig,
  UpdateAssistantSchedulerConfigBody,
} from "../contracts/assistant-scheduler";

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

@Injectable()
export class AssistantSchedulerConfigService {
  constructor(private readonly configService: ConfigService) {}

  async read(): Promise<AssistantSchedulerConfig> {
    const path = this.configPath();
    try {
      const content = await readFile(path, "utf8");
      const parsed = JSON.parse(content) as Partial<AssistantSchedulerConfig>;
      return {
        assistant_api_url: this.normalizeUrl(
          parsed.assistant_api_url,
          this.defaultConfig().assistant_api_url,
        ),
        poll_interval_ms: this.normalizePollInterval(
          parsed.poll_interval_ms,
          this.defaultConfig().poll_interval_ms,
        ),
      };
    } catch (error) {
      if (!this.isMissingPath(error)) {
        throw error;
      }

      const defaults = this.defaultConfig();
      await mkdir(this.configDirectory(), { recursive: true });
      await writeFile(path, `${JSON.stringify(defaults, null, 2)}\n`, "utf8");
      return defaults;
    }
  }

  async write(
    update: UpdateAssistantSchedulerConfigBody,
  ): Promise<AssistantSchedulerConfig> {
    const current = await this.read();
    const next: AssistantSchedulerConfig = {
      assistant_api_url: current.assistant_api_url,
      poll_interval_ms:
        update.poll_interval_ms === undefined
          ? current.poll_interval_ms
          : this.requirePollInterval(update.poll_interval_ms),
    };
    await mkdir(this.configDirectory(), { recursive: true });
    await writeFile(
      this.configPath(),
      `${JSON.stringify(next, null, 2)}\n`,
      "utf8",
    );
    return next;
  }

  private defaultConfig(): AssistantSchedulerConfig {
    return {
      assistant_api_url: this.normalizeUrl(
        this.configService.get<string>(
          "ASSISTANT_API_URL",
          "http://assistant-api:3000",
        ),
        "http://assistant-api:3000",
      ),
      poll_interval_ms: this.normalizePollInterval(
        this.configService.get<string>("ASSISTANT_SCHEDULER_POLL_MS", "1000"),
        1000,
      ),
    };
  }

  private normalizeUrl(value: unknown, fallback: string): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      return fallback;
    }
    try {
      const parsed = new URL(value.trim());
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return fallback;
      }
      return trimTrailingSlash(parsed.toString());
    } catch {
      return fallback;
    }
  }

  private normalizePollInterval(value: unknown, fallback: number): number {
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number.parseInt(value, 10)
          : Number.NaN;
    if (!Number.isFinite(parsed) || parsed < 250) {
      return fallback;
    }
    return Math.floor(parsed);
  }

  private requirePollInterval(value: unknown): number {
    const normalized = this.normalizePollInterval(value, Number.NaN);
    if (!Number.isFinite(normalized)) {
      throw new BadRequestException(
        "assistant-scheduler config validation failed: poll_interval_ms must be >= 250",
      );
    }
    return normalized;
  }

  private configPath(): string {
    return join(this.runtimeDirectory(), "config", "assistant-scheduler.json");
  }

  private configDirectory(): string {
    return join(this.runtimeDirectory(), "config");
  }

  private runtimeDirectory(): string {
    return this.configService.get<string>(
      "ASSISTANT_SCHEDULER_RUNTIME_DIR",
      join(process.cwd(), "runtime", "assistant-scheduler"),
    );
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
