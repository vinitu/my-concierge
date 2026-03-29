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
  allowed_incoming_message_types: GatewayWebIncomingMessageType[];
  user_id: string;
}

export interface UpdateGatewayWebConfigBody {
  allowed_incoming_message_types?: GatewayWebIncomingMessageType[];
}

export const GATEWAY_WEB_INCOMING_MESSAGE_TYPES = [
  'response.message',
  'response.error',
  'response.thinking',
] as const;

const MEMORY_EVENT_KINDS = [
  'fact',
] as const;

const MEMORY_EVENT_ACTIONS = [
  'added',
  'updated',
  'deleted',
  'readed',
  'failed',
] as const;

const MEMORY_KINDED_EVENTS = MEMORY_EVENT_KINDS.flatMap((kind) =>
  MEMORY_EVENT_ACTIONS.map((action) => `memory.${kind}.${action}`),
);

export const GATEWAY_WEB_EVENT_TYPES = [
  ...MEMORY_KINDED_EVENTS,
] as const;

export const GATEWAY_WEB_ALLOWED_INCOMING_MESSAGE_TYPES = [
  ...GATEWAY_WEB_INCOMING_MESSAGE_TYPES,
  ...GATEWAY_WEB_EVENT_TYPES,
] as const;

export type GatewayWebIncomingMessageType =
  (typeof GATEWAY_WEB_ALLOWED_INCOMING_MESSAGE_TYPES)[number];

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
        assistant_memory_url: this.resolveAssistantMemoryUrl(parsed.assistant_memory_url),
        allowed_incoming_message_types: this.normalizeAllowedIncomingMessageTypes(
          parsed.allowed_incoming_message_types,
          this.defaultConfig().allowed_incoming_message_types,
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
    if ('assistant_api_url' in update || 'assistant_memory_url' in update || 'user_id' in update) {
      throw new BadRequestException(
        'gateway-web config validation failed: assistant_api_url, assistant_memory_url, and user_id are env-only settings',
      );
    }
    const next: GatewayWebConfig = {
      assistant_api_url: current.assistant_api_url,
      assistant_memory_url: current.assistant_memory_url,
      allowed_incoming_message_types:
        update.allowed_incoming_message_types === undefined
          ? current.allowed_incoming_message_types
          : this.requireAllowedIncomingMessageTypes(update.allowed_incoming_message_types),
      user_id: current.user_id,
    };

    await mkdir(this.configDirectory(), { recursive: true });
    await writeFile(this.configPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8');

    return next;
  }

  private defaultConfig(): GatewayWebConfig {
    return {
      assistant_api_url: this.normalizeUrl(
        this.configService.get<string>('ASSISTANT_API_URL', 'http://localhost:8084'),
        'http://localhost:8084',
      ),
      assistant_memory_url: this.normalizeUrl(
        this.configService.get<string>('ASSISTANT_MEMORY_URL', 'http://localhost:8086'),
        'http://localhost:8086',
      ),
      allowed_incoming_message_types: this.normalizeAllowedIncomingMessageTypes(
        this.configService.get<unknown>('GATEWAY_WEB_ALLOWED_INCOMING_MESSAGE_TYPES'),
        [...GATEWAY_WEB_ALLOWED_INCOMING_MESSAGE_TYPES],
      ),
      user_id: this.normalizeUserId(
        this.configService.get<string>('GATEWAY_WEB_USER_ID', 'default-user'),
        'default-user',
      ),
    };
  }

  private resolveAssistantMemoryUrl(value: unknown): string {
    const fallback = this.defaultConfig().assistant_memory_url;
    const normalized = this.normalizeUrl(value, fallback);
    const envValue = this.configService.get<string>('ASSISTANT_MEMORY_URL');
    const normalizedEnv = this.normalizeUrl(envValue, fallback);

    if (this.isLoopbackUrl(normalized) && !this.isLoopbackUrl(normalizedEnv)) {
      return normalizedEnv;
    }

    return normalized;
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

  private normalizeBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
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

  private requireAllowedIncomingMessageTypes(value: unknown): GatewayWebIncomingMessageType[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(
        'gateway-web config validation failed: allowed_incoming_message_types must be an array of known message type names',
      );
    }

    const uniqueTypes = Array.from(new Set(value));
    const normalized = uniqueTypes.filter((entry): entry is GatewayWebIncomingMessageType => {
      return typeof entry === 'string' && this.isKnownIncomingMessageType(entry);
    });

    if (normalized.length !== uniqueTypes.length) {
      throw new BadRequestException(
        'gateway-web config validation failed: allowed_incoming_message_types contains unknown values',
      );
    }

    return normalized;
  }

  private normalizeAllowedIncomingMessageTypes(
    value: unknown,
    fallback: GatewayWebIncomingMessageType[],
  ): GatewayWebIncomingMessageType[] {
    if (Array.isArray(value)) {
      const uniqueTypes = Array.from(new Set(value)).flatMap((entry) =>
        this.expandLegacyIncomingMessageType(entry),
      );
      const normalized = uniqueTypes.filter((entry): entry is GatewayWebIncomingMessageType => {
        return typeof entry === 'string' && this.isKnownIncomingMessageType(entry);
      });
      if (normalized.length > 0) {
        return normalized;
      }
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parts = value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
      const normalized = Array.from(
        new Set(parts.flatMap((entry) => this.expandLegacyIncomingMessageType(entry)).filter(
          (entry): entry is GatewayWebIncomingMessageType => this.isKnownIncomingMessageType(entry),
        )),
      );
      if (normalized.length > 0) {
        return normalized;
      }
    }

    return [...fallback];
  }

  private isKnownIncomingMessageType(value: string): value is GatewayWebIncomingMessageType {
    return GATEWAY_WEB_ALLOWED_INCOMING_MESSAGE_TYPES.includes(value as GatewayWebIncomingMessageType);
  }

  private expandLegacyIncomingMessageType(value: unknown): string[] {
    if (typeof value !== 'string') {
      return [];
    }

    const trimmed = value.trim();
    if (trimmed === 'event.memory' || trimmed === 'event.other') {
      return [...GATEWAY_WEB_EVENT_TYPES];
    }
    if (trimmed === 'event.run') {
      return [];
    }
    if (trimmed === 'thinking') {
      return ['response.thinking'];
    }

    return [trimmed];
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

  private isLoopbackUrl(value: string): boolean {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      return host === 'localhost' || host === '127.0.0.1';
    } catch {
      return false;
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
