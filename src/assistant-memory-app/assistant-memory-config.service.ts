import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AssistantMemoryConfig,
  AssistantMemoryExtractKind,
  UpdateAssistantMemoryConfigBody,
} from "../contracts/assistant-memory";

const ALL_EXTRACTS: AssistantMemoryExtractKind[] = ["fact"];

@Injectable()
export class AssistantMemoryConfigService {
  constructor(private readonly configService: ConfigService) {}

  async read(): Promise<AssistantMemoryConfig> {
    const path = this.configPath();
    try {
      const content = await readFile(path, "utf8");
      const parsed = JSON.parse(content) as Partial<AssistantMemoryConfig>;
      return {
        enabled_extracts: this.normalizeExtracts(parsed.enabled_extracts),
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
    update: UpdateAssistantMemoryConfigBody,
  ): Promise<AssistantMemoryConfig> {
    const current = await this.read();
    const next: AssistantMemoryConfig = {
      enabled_extracts:
        update.enabled_extracts === undefined
          ? current.enabled_extracts
          : this.requireExtracts(update.enabled_extracts),
    };

    await mkdir(this.configDirectory(), { recursive: true });
    await writeFile(
      this.configPath(),
      `${JSON.stringify(next, null, 2)}\n`,
      "utf8",
    );
    return next;
  }

  private normalizeExtracts(value: unknown): AssistantMemoryExtractKind[] {
    if (!Array.isArray(value)) {
      return this.defaultConfig().enabled_extracts;
    }

    const parsed = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().toLowerCase())
      .filter((item): item is AssistantMemoryExtractKind =>
        ALL_EXTRACTS.includes(item as AssistantMemoryExtractKind),
      );

    const unique = Array.from(new Set(parsed));
    if (unique.length === 0) {
      return this.defaultConfig().enabled_extracts;
    }

    return ALL_EXTRACTS.filter((item) => unique.includes(item));
  }

  private requireExtracts(value: unknown): AssistantMemoryExtractKind[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(
        "assistant-memory config validation failed: enabled_extracts must be an array",
      );
    }

    const parsed = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().toLowerCase())
      .filter((item): item is AssistantMemoryExtractKind =>
        ALL_EXTRACTS.includes(item as AssistantMemoryExtractKind),
      );

    const unique = Array.from(new Set(parsed));
    if (unique.length === 0) {
      throw new BadRequestException(
        "assistant-memory config validation failed: enabled_extracts must contain at least one supported extract",
      );
    }

    return ALL_EXTRACTS.filter((item) => unique.includes(item));
  }

  private defaultConfig(): AssistantMemoryConfig {
    const envValue = this.configService.get<string>(
      "ASSISTANT_MEMORY_ENABLED_EXTRACTS",
      "",
    );
    const fromEnv = envValue
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item): item is AssistantMemoryExtractKind =>
        ALL_EXTRACTS.includes(item as AssistantMemoryExtractKind),
      );
    const unique = Array.from(new Set(fromEnv));
    return {
      enabled_extracts:
        unique.length > 0
          ? ALL_EXTRACTS.filter((item) => unique.includes(item))
          : [...ALL_EXTRACTS],
    };
  }

  private configPath(): string {
    return join(this.runtimeDirectory(), "config", "assistant-memory.json");
  }

  private configDirectory(): string {
    return join(this.runtimeDirectory(), "config");
  }

  private runtimeDirectory(): string {
    return this.configService.get<string>(
      "ASSISTANT_MEMORY_RUNTIME_DIR",
      join(process.cwd(), "runtime", "assistant-memory"),
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
