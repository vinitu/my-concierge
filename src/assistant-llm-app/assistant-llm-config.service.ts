import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AssistantLlmConfig,
  AssistantLlmProvider,
} from '../contracts/assistant-llm';
import {
  defaultModelForProvider,
  STATIC_PROVIDER_MODELS,
} from '../contracts/assistant-llm-model-catalog';

const SUPPORTED_PROVIDERS: AssistantLlmProvider[] = ['xai', 'ollama', 'deepseek'];

@Injectable()
export class AssistantLlmConfigService {
  constructor(private readonly configService: ConfigService) {}

  async read(): Promise<AssistantLlmConfig> {
    try {
      const content = await readFile(this.configPath(), 'utf8');
      const parsed = JSON.parse(content) as Partial<AssistantLlmConfig>;
      const provider = this.normalizeProvider(parsed.provider);

      return {
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
        model: this.normalizeModel(provider, parsed.model),
        ollama_base_url: this.normalizeUrl(
          parsed.ollama_base_url,
          this.configService.get<string>('OLLAMA_BASE_URL', 'http://host.docker.internal:11434'),
        ),
        ollama_timeout_ms: this.normalizeTimeoutMs(
          parsed.ollama_timeout_ms,
          this.configService.get<string>('OLLAMA_TIMEOUT_MS', '360000'),
        ),
        provider,
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

  async write(config: AssistantLlmConfig): Promise<AssistantLlmConfig> {
    const defaults = this.defaultConfig();
    const provider = this.normalizeProvider(config.provider);
    const next: AssistantLlmConfig = {
      deepseek_api_key: this.normalizeSecret(config.deepseek_api_key, defaults.deepseek_api_key),
      deepseek_base_url: this.normalizeUrl(config.deepseek_base_url, defaults.deepseek_base_url),
      deepseek_timeout_ms: this.normalizeTimeoutMs(
        config.deepseek_timeout_ms,
        defaults.deepseek_timeout_ms,
      ),
      model: this.normalizeModel(provider, config.model),
      ollama_base_url: this.normalizeUrl(config.ollama_base_url, defaults.ollama_base_url),
      ollama_timeout_ms: this.normalizeTimeoutMs(
        config.ollama_timeout_ms,
        defaults.ollama_timeout_ms,
      ),
      provider,
      xai_api_key: this.normalizeSecret(config.xai_api_key, defaults.xai_api_key),
      xai_base_url: this.normalizeUrl(config.xai_base_url, defaults.xai_base_url),
      xai_timeout_ms: this.normalizeTimeoutMs(config.xai_timeout_ms, defaults.xai_timeout_ms),
    };

    await mkdir(this.configDirectory(), { recursive: true });
    await writeFile(this.configPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return next;
  }

  private defaultConfig(): AssistantLlmConfig {
    return {
      deepseek_api_key: this.configService.get<string>('DEEPSEEK_API_KEY', ''),
      deepseek_base_url: this.normalizeUrl(
        this.configService.get<string>('DEEPSEEK_BASE_URL', 'https://api.deepseek.com'),
        'https://api.deepseek.com',
      ),
      deepseek_timeout_ms: this.normalizeTimeoutMs(
        undefined,
        this.configService.get<string>('DEEPSEEK_TIMEOUT_MS', '360000'),
      ),
      model: defaultModelForProvider('ollama'),
      ollama_base_url: this.normalizeUrl(
        this.configService.get<string>('OLLAMA_BASE_URL', 'http://host.docker.internal:11434'),
        'http://host.docker.internal:11434',
      ),
      ollama_timeout_ms: this.normalizeTimeoutMs(
        undefined,
        this.configService.get<string>('OLLAMA_TIMEOUT_MS', '360000'),
      ),
      provider: this.normalizeProvider(this.configService.get<string>('LLM_PROVIDER', 'ollama')),
      xai_api_key: this.configService.get<string>('XAI_API_KEY', ''),
      xai_base_url: this.normalizeUrl(
        this.configService.get<string>('XAI_BASE_URL', 'https://api.x.ai/v1'),
        'https://api.x.ai/v1',
      ),
      xai_timeout_ms: this.normalizeTimeoutMs(
        undefined,
        this.configService.get<string>('XAI_TIMEOUT_MS', '360000'),
      ),
    };
  }

  private configPath(): string {
    return join(this.datadir(), 'config', 'llm.json');
  }

  private configDirectory(): string {
    return join(this.datadir(), 'config');
  }

  private datadir(): string {
    return this.configService.get<string>(
      'ASSISTANT_DATADIR',
      join(process.cwd(), 'runtime', 'assistant-llm'),
    );
  }

  private normalizeProvider(value: unknown): AssistantLlmProvider {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (SUPPORTED_PROVIDERS.includes(normalized as AssistantLlmProvider)) {
        return normalized as AssistantLlmProvider;
      }
    }
    return 'ollama';
  }

  private normalizeModel(provider: AssistantLlmProvider, value: unknown): string {
    if (typeof value === 'string' && value.trim()) {
      const normalized = value.trim();
      if (STATIC_PROVIDER_MODELS[provider].includes(normalized)) {
        return normalized;
      }
    }
    return defaultModelForProvider(provider);
  }

  private normalizeTimeoutMs(value: unknown, fallback: string | number): number {
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number.parseInt(value, 10)
          : typeof fallback === 'number'
            ? fallback
            : Number.parseInt(fallback, 10);

    if (!Number.isFinite(parsed)) {
      return 360000;
    }

    return Math.min(3600000, Math.max(1000, Math.floor(parsed)));
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
