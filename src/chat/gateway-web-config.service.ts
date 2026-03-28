import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

export interface GatewayWebConfig {
  assistant_api_url: string;
  assistant_memory_url: string;
  callback_base_url: string;
  user_id: string;
}

export interface UpdateGatewayWebConfigBody {
  assistant_api_url?: string;
  assistant_memory_url?: string;
  callback_base_url?: string;
  user_id?: string;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

@Injectable()
export class GatewayWebConfigService {
  constructor(private readonly configService: ConfigService) {}

  async read(): Promise<GatewayWebConfig> {
    const path = this.configPath();

    try {
      const content = await readFile(path, 'utf8');
      const parsed = JSON.parse(content) as Partial<GatewayWebConfig>;

      return {
        assistant_api_url: this.normalizeUrl(
          parsed.assistant_api_url,
          this.defaultConfig().assistant_api_url,
        ),
        assistant_memory_url: this.normalizeUrl(
          parsed.assistant_memory_url,
          this.defaultConfig().assistant_memory_url,
        ),
        callback_base_url: this.normalizeUrl(
          parsed.callback_base_url,
          this.defaultConfig().callback_base_url,
        ),
        user_id: this.normalizeUserId(
          parsed.user_id,
          this.defaultConfig().user_id,
        ),
      };
    } catch (error) {
      if (!this.isMissingPath(error)) {
        throw error;
      }

      const defaults = this.defaultConfig();
      await mkdir(this.configDirectory(), { recursive: true });
      await writeFile(this.configPath(), `${JSON.stringify(defaults, null, 2)}\n`, 'utf8');
      return defaults;
    }
  }

  async write(
    update: UpdateGatewayWebConfigBody | GatewayWebConfig,
  ): Promise<GatewayWebConfig> {
    const current = await this.read();
    const next: GatewayWebConfig = {
      assistant_api_url:
        update.assistant_api_url === undefined
          ? current.assistant_api_url
          : this.requireUrl('assistant_api_url', update.assistant_api_url),
      assistant_memory_url:
        update.assistant_memory_url === undefined
          ? current.assistant_memory_url
          : this.requireUrl('assistant_memory_url', update.assistant_memory_url),
      callback_base_url:
        update.callback_base_url === undefined
          ? current.callback_base_url
          : this.requireUrl('callback_base_url', update.callback_base_url),
      user_id:
        update.user_id === undefined
          ? current.user_id
          : this.requireUserId(update.user_id),
    };

    await mkdir(this.configDirectory(), { recursive: true });
    await writeFile(this.configPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8');

    return next;
  }

  private defaultConfig(): GatewayWebConfig {
    const localPort = this.configService.get<string>('PORT', '3000');

    return {
      assistant_api_url: this.normalizeUrl(
        this.configService.get<string>('ASSISTANT_API_URL', 'http://localhost:3000'),
        'http://localhost:3000',
      ),
      assistant_memory_url: this.normalizeUrl(
        this.configService.get<string>('ASSISTANT_MEMORY_URL', 'http://localhost:3002'),
        'http://localhost:3002',
      ),
      callback_base_url: this.normalizeUrl(
        this.configService.get<string>('CALLBACK_BASE_URL', `http://localhost:${localPort}`),
        `http://localhost:${localPort}`,
      ),
      user_id: this.normalizeUserId(
        this.configService.get<string>('GATEWAY_WEB_USER_ID', 'default-user'),
        'default-user',
      ),
    };
  }

  private configPath(): string {
    return join(this.runtimeDirectory(), 'config', 'gateway-web.json');
  }

  private configDirectory(): string {
    return join(this.runtimeDirectory(), 'config');
  }

  private runtimeDirectory(): string {
    return this.configService.get<string>(
      'GATEWAY_WEB_RUNTIME_DIR',
      join(process.cwd(), 'runtime', 'gateway-web'),
    );
  }

  private normalizeUrl(value: unknown, fallback: string): string {
    if (typeof value === 'string' && value.trim().length > 0) {
      return this.normalizeValidUrlOrFallback(value, fallback);
    }

    return this.normalizeValidUrlOrFallback(fallback, fallback);
  }

  private normalizeUserId(value: unknown, fallback: string): string {
    if (typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value.trim())) {
      return value.trim();
    }

    return fallback;
  }

  private requireUrl(field: string, value: unknown): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(
        `gateway-web config validation failed: ${field} must be a non-empty URL`,
      );
    }

    try {
      const parsed = new URL(value.trim());

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('unsupported protocol');
      }

      return trimTrailingSlash(parsed.toString());
    } catch {
      throw new BadRequestException(
        `gateway-web config validation failed: ${field} must be a valid http/https URL`,
      );
    }
  }

  private requireUserId(value: unknown): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(
        'gateway-web config validation failed: user_id must be a string',
      );
    }

    const normalized = value.trim();
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(normalized)) {
      throw new BadRequestException(
        'gateway-web config validation failed: user_id must match ^[A-Za-z0-9_-]{1,128}$',
      );
    }

    return normalized;
  }

  private normalizeValidUrlOrFallback(value: string, fallback: string): string {
    try {
      const parsed = new URL(value.trim());

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return trimTrailingSlash(fallback);
      }

      return trimTrailingSlash(parsed.toString());
    } catch {
      return trimTrailingSlash(fallback);
    }
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
