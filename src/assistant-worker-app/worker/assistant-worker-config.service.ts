import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import type { AssistantWorkerProvider } from './assistant-llm-provider';

export interface AssistantWorkerConfig {
  provider: AssistantWorkerProvider;
}

const DEFAULT_WORKER_CONFIG: AssistantWorkerConfig = {
  provider: 'xai',
};

const SUPPORTED_WORKER_PROVIDERS: AssistantWorkerProvider[] = ['xai', 'ollama'];

@Injectable()
export class AssistantWorkerConfigService {
  constructor(private readonly configService: ConfigService) {}

  async read(): Promise<AssistantWorkerConfig> {
    const path = this.configPath();

    try {
      const content = await readFile(path, 'utf8');
      const parsed = JSON.parse(content) as Partial<AssistantWorkerConfig>;

      return {
        provider: this.normalizeProvider(parsed.provider),
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
    const normalizedConfig: AssistantWorkerConfig = {
      provider: this.normalizeProvider(config.provider),
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
    return this.configService.get<string>('ASSISTANT_DATADIR', join(process.cwd(), 'runtime'));
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

  private isMissingPath(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    );
  }
}
