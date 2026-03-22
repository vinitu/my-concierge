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

export interface AssistantWorkerConfig {
  model: string;
  memory_window: number;
  provider: AssistantWorkerProvider;
  thinking_interval_seconds: number;
}

const DEFAULT_WORKER_CONFIG: AssistantWorkerConfig = {
  memory_window: 3,
  model: defaultModelForProvider('xai'),
  provider: 'xai',
  thinking_interval_seconds: 2,
};

const SUPPORTED_WORKER_PROVIDERS: AssistantWorkerProvider[] = ['xai', 'ollama', 'deepseek'];

@Injectable()
export class AssistantWorkerConfigService {
  constructor(private readonly configService: ConfigService) {}

  async read(): Promise<AssistantWorkerConfig> {
    const path = this.configPath();

    try {
      const content = await readFile(path, 'utf8');
      const parsed = JSON.parse(content) as Partial<AssistantWorkerConfig>;

      return {
        model: this.normalizeModel(
          this.normalizeProvider(parsed.provider),
          parsed.model,
        ),
        memory_window: this.normalizeMemoryWindow(parsed.memory_window),
        provider: this.normalizeProvider(parsed.provider),
        thinking_interval_seconds: this.normalizeThinkingIntervalSeconds(
          parsed.thinking_interval_seconds,
        ),
      };
    } catch (error) {
      if (!this.isMissingPath(error)) {
        throw error;
      }

      await this.write(DEFAULT_WORKER_CONFIG);
      return DEFAULT_WORKER_CONFIG;
    }
  }

  async write(config: AssistantWorkerConfig): Promise<AssistantWorkerConfig> {
    const provider = this.normalizeProvider(config.provider);
    const normalizedConfig: AssistantWorkerConfig = {
      model: this.normalizeModel(provider, config.model),
      memory_window: this.normalizeMemoryWindow(config.memory_window),
      provider,
      thinking_interval_seconds: this.normalizeThinkingIntervalSeconds(
        config.thinking_interval_seconds,
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

    return DEFAULT_WORKER_CONFIG.provider;
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

    return DEFAULT_WORKER_CONFIG.memory_window;
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

    return DEFAULT_WORKER_CONFIG.thinking_interval_seconds;
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
