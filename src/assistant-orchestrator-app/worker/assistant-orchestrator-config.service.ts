import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import {
  type AssistantToolName,
  SUPPORTED_ASSISTANT_TOOL_NAMES,
} from './assistant-tool-catalog.service';

export interface AssistantOrchestratorConfig {
  brave_api_key: string;
  brave_base_url: string;
  brave_timeout_ms: number;
  enabled_tools: AssistantToolName[];
  memory_window: number;
  run_timeout_seconds: number;
  thinking_interval_seconds: number;
}

@Injectable()
export class AssistantOrchestratorConfigService {
  constructor(private readonly configService: ConfigService) {}

  async read(): Promise<AssistantOrchestratorConfig> {
    try {
      const content = await readFile(this.configPath(), 'utf8');
      const parsed = JSON.parse(content) as Partial<AssistantOrchestratorConfig>;
      return {
        brave_api_key: this.normalizeSecret(
          parsed.brave_api_key,
          this.configService.get<string>('BRAVE_API_KEY', ''),
        ),
        brave_base_url: this.normalizeUrl(
          parsed.brave_base_url,
          this.configService.get<string>('BRAVE_BASE_URL', 'https://api.search.brave.com'),
        ),
        brave_timeout_ms: this.normalizeTimeoutMs(
          parsed.brave_timeout_ms,
          this.configService.get<string>('BRAVE_TIMEOUT_MS', '30000'),
        ),
        enabled_tools: this.normalizeEnabledTools(parsed.enabled_tools),
        memory_window: this.normalizeMemoryWindow(parsed.memory_window),
        run_timeout_seconds: this.normalizeRunTimeoutSeconds(parsed.run_timeout_seconds),
        thinking_interval_seconds: this.normalizeThinkingIntervalSeconds(
          parsed.thinking_interval_seconds,
        ),
      };
    } catch (error) {
      if (!this.isMissingPath(error)) {
        throw error;
      }

      const defaults = this.defaultConfig();
      await this.write(defaults);
      return defaults;
    }
  }

  async write(config: AssistantOrchestratorConfig): Promise<AssistantOrchestratorConfig> {
    const defaults = this.defaultConfig();
    const next: AssistantOrchestratorConfig = {
      brave_api_key: this.normalizeSecret(config.brave_api_key, defaults.brave_api_key),
      brave_base_url: this.normalizeUrl(config.brave_base_url, defaults.brave_base_url),
      brave_timeout_ms: this.normalizeTimeoutMs(config.brave_timeout_ms, defaults.brave_timeout_ms),
      enabled_tools: this.normalizeEnabledTools(config.enabled_tools),
      memory_window: this.normalizeMemoryWindow(config.memory_window),
      run_timeout_seconds: this.normalizeRunTimeoutSeconds(config.run_timeout_seconds),
      thinking_interval_seconds: this.normalizeThinkingIntervalSeconds(
        config.thinking_interval_seconds,
      ),
    };

    await mkdir(this.configDirectory(), { recursive: true });
    await writeFile(this.configPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return next;
  }

  configPath(): string {
    return join(this.datadir(), 'config', 'orchestrator.json');
  }

  private configDirectory(): string {
    return join(this.datadir(), 'config');
  }

  private datadir(): string {
    return this.configService.get<string>(
      'ASSISTANT_DATADIR',
      join(process.cwd(), 'runtime', 'assistant-orchestrator'),
    );
  }

  private defaultConfig(): AssistantOrchestratorConfig {
    return {
      brave_api_key: this.configService.get<string>('BRAVE_API_KEY', '').trim(),
      brave_base_url: this.normalizeUrl(
        this.configService.get<string>('BRAVE_BASE_URL', 'https://api.search.brave.com'),
        'https://api.search.brave.com',
      ),
      brave_timeout_ms: this.normalizeTimeoutMs(
        this.configService.get<string>('BRAVE_TIMEOUT_MS', '30000'),
        30000,
      ),
      enabled_tools: [...SUPPORTED_ASSISTANT_TOOL_NAMES],
      memory_window: 6,
      run_timeout_seconds: this.normalizeRunTimeoutSeconds(
        this.configService.get<string>('ASSISTANT_RUN_TIMEOUT_SECONDS', '30'),
      ),
      thinking_interval_seconds: 2,
    };
  }

  private normalizeEnabledTools(value: unknown): AssistantToolName[] {
    if (Array.isArray(value)) {
      const normalized = value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(
          (entry): entry is AssistantToolName =>
            (SUPPORTED_ASSISTANT_TOOL_NAMES as readonly string[]).includes(entry),
        );
      return [...new Set(normalized)];
    }
    return [...SUPPORTED_ASSISTANT_TOOL_NAMES];
  }

  private normalizeMemoryWindow(value: unknown): number {
    return this.normalizeNumber(value, this.defaultConfig().memory_window, 1, 40);
  }

  private normalizeRunTimeoutSeconds(value: unknown): number {
    return this.normalizeNumber(value, 30, 5, 600);
  }

  private normalizeThinkingIntervalSeconds(value: unknown): number {
    return this.normalizeNumber(value, 2, 1, 30);
  }

  private normalizeTimeoutMs(value: unknown, fallback: number | string): number {
    const fallbackNumber = this.normalizeNumber(fallback, 30000, 1000, 3_600_000);
    return this.normalizeNumber(value, fallbackNumber, 1000, 3_600_000);
  }

  private normalizeNumber(
    value: unknown,
    fallback: number,
    min: number,
    max: number,
  ): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.min(max, Math.max(min, Math.floor(value)));
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseInt(value.trim(), 10);
      if (Number.isFinite(parsed)) {
        return Math.min(max, Math.max(min, parsed));
      }
    }
    return fallback;
  }

  private normalizeSecret(value: unknown, fallback: string): string {
    if (typeof value === 'string') {
      return value.trim();
    }
    return fallback.trim();
  }

  private normalizeUrl(value: unknown, fallback: string): string {
    if (typeof value === 'string' && value.trim()) {
      return value.trim().replace(/\/+$/, '');
    }
    return fallback.trim().replace(/\/+$/, '');
  }

  private isMissingPath(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'ENOENT'
    );
  }
}
