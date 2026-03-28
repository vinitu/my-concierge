import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import type { AssistantWorkerProvider } from './assistant-llm-provider';
import {
  defaultModelForProvider,
  STATIC_PROVIDER_MODELS,
} from './assistant-llm-model-catalog';
import {
  type AssistantToolName,
  SUPPORTED_ASSISTANT_TOOL_NAMES,
} from './assistant-tool-catalog.service';

export interface AssistantWorkerConfig {
  brave_api_key: string;
  brave_base_url: string;
  brave_timeout_ms: number;
  deepseek_api_key: string;
  deepseek_base_url: string;
  deepseek_timeout_ms: number;
  enabled_tools: AssistantToolName[];
  model: string;
  memory_window: number;
  ollama_base_url: string;
  ollama_timeout_ms: number;
  provider: AssistantWorkerProvider;
  run_timeout_seconds: number;
  thinking_interval_seconds: number;
  xai_api_key: string;
  xai_base_url: string;
  xai_timeout_ms: number;
}

const SUPPORTED_WORKER_PROVIDERS: AssistantWorkerProvider[] = ['xai', 'ollama', 'deepseek'];

@Injectable()
export class AssistantWorkerConfigService {
  constructor(private readonly configService: ConfigService) {}

  async read(): Promise<AssistantWorkerConfig> {
    const path = this.configPath();

    try {
      const content = await readFile(path, 'utf8');
      const parsed = JSON.parse(content) as Partial<AssistantWorkerConfig>;
      const provider = this.normalizeProvider(parsed.provider);

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
        deepseek_api_key: this.normalizeSecret(
          parsed.deepseek_api_key,
          this.configService.get<string>('DEEPSEEK_API_KEY', ''),
        ),
        deepseek_base_url: this.normalizeUrl(
          parsed.deepseek_base_url,
          this.configService.get<string>('DEEPSEEK_BASE_URL', 'https://api.deepseek.com'),
        ),
        deepseek_timeout_ms: this.normalizeTimeoutMs(
          parsed.deepseek_timeout_ms,
          this.configService.get<string>('DEEPSEEK_TIMEOUT_MS', '360000'),
        ),
        enabled_tools: this.normalizeEnabledTools(parsed.enabled_tools),
        model: this.normalizeModel(
          provider,
          parsed.model,
        ),
        memory_window: this.normalizeMemoryWindow(parsed.memory_window),
        ollama_base_url: this.normalizeUrl(
          parsed.ollama_base_url,
          this.configService.get<string>('OLLAMA_BASE_URL', 'http://host.docker.internal:11434'),
        ),
        ollama_timeout_ms: this.normalizeTimeoutMs(
          parsed.ollama_timeout_ms,
          this.configService.get<string>('OLLAMA_TIMEOUT_MS', '360000'),
        ),
        provider,
        run_timeout_seconds: this.normalizeRunTimeoutSeconds(
          parsed.run_timeout_seconds,
        ),
        thinking_interval_seconds: this.normalizeThinkingIntervalSeconds(
          parsed.thinking_interval_seconds,
        ),
        xai_api_key: this.normalizeSecret(
          parsed.xai_api_key,
          this.configService.get<string>('XAI_API_KEY', ''),
        ),
        xai_base_url: this.normalizeUrl(
          parsed.xai_base_url,
          this.configService.get<string>('XAI_BASE_URL', 'https://api.x.ai/v1'),
        ),
        xai_timeout_ms: this.normalizeTimeoutMs(
          parsed.xai_timeout_ms,
          this.configService.get<string>('XAI_TIMEOUT_MS', '360000'),
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

  async write(config: AssistantWorkerConfig): Promise<AssistantWorkerConfig> {
    const provider = this.normalizeProvider(config.provider);
    const defaults = this.defaultConfig();
    const normalizedConfig: AssistantWorkerConfig = {
      brave_api_key: this.normalizeSecret(
        config.brave_api_key,
        defaults.brave_api_key,
      ),
      brave_base_url: this.normalizeUrl(
        config.brave_base_url,
        defaults.brave_base_url,
      ),
      brave_timeout_ms: this.normalizeTimeoutMs(
        config.brave_timeout_ms,
        defaults.brave_timeout_ms,
      ),
      deepseek_api_key: this.normalizeSecret(
        config.deepseek_api_key,
        defaults.deepseek_api_key,
      ),
      deepseek_base_url: this.normalizeUrl(
        config.deepseek_base_url,
        defaults.deepseek_base_url,
      ),
      deepseek_timeout_ms: this.normalizeTimeoutMs(
        config.deepseek_timeout_ms,
        defaults.deepseek_timeout_ms,
      ),
      enabled_tools: this.normalizeEnabledTools(config.enabled_tools),
      model: this.normalizeModel(provider, config.model),
      memory_window: this.normalizeMemoryWindow(config.memory_window),
      ollama_base_url: this.normalizeUrl(
        config.ollama_base_url,
        defaults.ollama_base_url,
      ),
      ollama_timeout_ms: this.normalizeTimeoutMs(
        config.ollama_timeout_ms,
        defaults.ollama_timeout_ms,
      ),
      provider,
      run_timeout_seconds: this.normalizeRunTimeoutSeconds(config.run_timeout_seconds),
      thinking_interval_seconds: this.normalizeThinkingIntervalSeconds(
        config.thinking_interval_seconds,
      ),
      xai_api_key: this.normalizeSecret(config.xai_api_key, defaults.xai_api_key),
      xai_base_url: this.normalizeUrl(config.xai_base_url, defaults.xai_base_url),
      xai_timeout_ms: this.normalizeTimeoutMs(
        config.xai_timeout_ms,
        defaults.xai_timeout_ms,
      ),
    };

    await mkdir(this.configDirectory(), { recursive: true });
    await writeFile(this.configPath(), `${JSON.stringify(normalizedConfig, null, 2)}\n`, 'utf8');

    return normalizedConfig;
  }

  configPath(): string {
    return join(this.datadir(), 'config', 'worker.json');
  }

  private configDirectory(): string {
    return join(this.datadir(), 'config');
  }

  private datadir(): string {
    return this.configService.get<string>(
      'ASSISTANT_DATADIR',
      join(process.cwd(), 'runtime', 'assistant-worker'),
    );
  }

  private normalizeProvider(value: unknown): AssistantWorkerProvider {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();

      if (
        SUPPORTED_WORKER_PROVIDERS.includes(normalized as AssistantWorkerProvider)
      ) {
        return normalized as AssistantWorkerProvider;
      }
    }

    return this.defaultConfig().provider;
  }

  private normalizeModel(provider: AssistantWorkerProvider, value: unknown): string {
    if (typeof value === 'string' && value.trim()) {
      const normalized = value.trim();

      if (provider === 'ollama') {
        return normalized;
      }

      if (STATIC_PROVIDER_MODELS[provider].includes(normalized)) {
        return normalized;
      }
    }

    return defaultModelForProvider(provider);
  }

  private normalizeMemoryWindow(value: unknown): number {
    if (typeof value === 'number' && Number.isInteger(value)) {
      return Math.min(20, Math.max(1, value));
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseInt(value.trim(), 10);

      if (Number.isInteger(parsed)) {
        return Math.min(20, Math.max(1, parsed));
      }
    }

    return this.defaultConfig().memory_window;
  }

  private normalizeThinkingIntervalSeconds(value: unknown): number {
    if (typeof value === 'number' && Number.isInteger(value)) {
      return Math.min(30, Math.max(1, value));
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseInt(value.trim(), 10);

      if (Number.isInteger(parsed)) {
        return Math.min(30, Math.max(1, parsed));
      }
    }

    return this.defaultConfig().thinking_interval_seconds;
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

  private normalizeRunTimeoutSeconds(value: unknown): number {
    return this.normalizeNumber(value, this.defaultConfig().run_timeout_seconds, 5, 600);
  }

  private normalizeTimeoutMs(value: unknown, fallback: number | string): number {
    const fallbackNumber = this.normalizeNumber(fallback, 360000, 1000, 3_600_000);
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
      return value.trim();
    }

    return fallback.trim();
  }

  private defaultConfig(): AssistantWorkerConfig {
    return {
      brave_api_key: this.configService.get<string>('BRAVE_API_KEY', '').trim(),
      brave_base_url: this.configService
        .get<string>('BRAVE_BASE_URL', 'https://api.search.brave.com')
        .trim(),
      brave_timeout_ms: this.normalizeTimeoutMs(
        this.configService.get<string>('BRAVE_TIMEOUT_MS', '30000'),
        30000,
      ),
      deepseek_api_key: this.configService.get<string>('DEEPSEEK_API_KEY', '').trim(),
      deepseek_base_url: this.configService
        .get<string>('DEEPSEEK_BASE_URL', 'https://api.deepseek.com')
        .trim(),
      deepseek_timeout_ms: this.normalizeTimeoutMs(
        this.configService.get<string>('DEEPSEEK_TIMEOUT_MS', '360000'),
        360000,
      ),
      enabled_tools: [...SUPPORTED_ASSISTANT_TOOL_NAMES],
      memory_window: 3,
      model: defaultModelForProvider('xai'),
      ollama_base_url: this.configService
        .get<string>('OLLAMA_BASE_URL', 'http://host.docker.internal:11434')
        .trim(),
      ollama_timeout_ms: this.normalizeTimeoutMs(
        this.configService.get<string>('OLLAMA_TIMEOUT_MS', '360000'),
        360000,
      ),
      provider: 'xai',
      run_timeout_seconds: this.normalizeNumber(
        this.configService.get<string>('ASSISTANT_RUN_TIMEOUT_SECONDS', '30'),
        30,
        5,
        600,
      ),
      thinking_interval_seconds: 2,
      xai_api_key: this.configService.get<string>('XAI_API_KEY', '').trim(),
      xai_base_url: this.configService.get<string>('XAI_BASE_URL', 'https://api.x.ai/v1').trim(),
      xai_timeout_ms: this.normalizeTimeoutMs(
        this.configService.get<string>('XAI_TIMEOUT_MS', '360000'),
        360000,
      ),
    };
  }

  private isMissingPath(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    );
  }
}
