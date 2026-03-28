import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { GatewayEmailConfig } from './gateway-email-transport';

export interface UpdateGatewayEmailConfigBody {
  email?: string;
  imap_host?: string;
  imap_port?: number | string;
  imap_secure?: boolean;
  password?: string;
  smtp_host?: string;
  smtp_port?: number | string;
  smtp_secure?: boolean;
  sync_delay_seconds?: number | string;
}

const DEFAULT_CONFIG: GatewayEmailConfig = {
  email: '',
  imap_host: '',
  imap_port: 993,
  imap_secure: true,
  password: '',
  smtp_host: '',
  smtp_port: 465,
  smtp_secure: true,
  sync_delay_seconds: 60,
  updated_at: null,
};

@Injectable()
export class GatewayEmailConfigService {
  constructor(private readonly configService: ConfigService) {}

  async read(): Promise<GatewayEmailConfig> {
    try {
      const raw = await readFile(this.configPath(), 'utf8');
      return this.normalize(JSON.parse(raw) as Partial<GatewayEmailConfig>);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return { ...DEFAULT_CONFIG };
      }

      throw error;
    }
  }

  async write(body: UpdateGatewayEmailConfigBody): Promise<GatewayEmailConfig> {
    const current = await this.read();
    const next: GatewayEmailConfig = {
      email: typeof body.email === 'string' ? body.email.trim() : current.email,
      imap_host: typeof body.imap_host === 'string' ? body.imap_host.trim() : current.imap_host,
      imap_port: this.normalizePort(body.imap_port, current.imap_port),
      imap_secure:
        typeof body.imap_secure === 'boolean' ? body.imap_secure : current.imap_secure,
      password: typeof body.password === 'string' ? body.password : current.password,
      smtp_host: typeof body.smtp_host === 'string' ? body.smtp_host.trim() : current.smtp_host,
      smtp_port: this.normalizePort(body.smtp_port, current.smtp_port),
      smtp_secure:
        typeof body.smtp_secure === 'boolean' ? body.smtp_secure : current.smtp_secure,
      sync_delay_seconds: this.normalizeDelay(body.sync_delay_seconds, current.sync_delay_seconds),
      updated_at: new Date().toISOString(),
    };

    await mkdir(dirname(this.configPath()), { recursive: true });
    await writeFile(this.configPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return next;
  }

  isReady(config: GatewayEmailConfig): boolean {
    return (
      config.email.length > 0 &&
      config.password.length > 0 &&
      config.imap_host.length > 0 &&
      config.smtp_host.length > 0
    );
  }

  runtimeDirectory(): string {
    return this.configService.get<string>(
      'GATEWAY_EMAIL_RUNTIME_DIR',
      join(process.cwd(), 'runtime', 'gateway-email'),
    );
  }

  private configPath(): string {
    return join(this.runtimeDirectory(), 'config', 'gateway-email.json');
  }

  private normalize(candidate: Partial<GatewayEmailConfig>): GatewayEmailConfig {
    return {
      email: typeof candidate.email === 'string' ? candidate.email : DEFAULT_CONFIG.email,
      imap_host:
        typeof candidate.imap_host === 'string' ? candidate.imap_host : DEFAULT_CONFIG.imap_host,
      imap_port: this.normalizePort(candidate.imap_port, DEFAULT_CONFIG.imap_port),
      imap_secure:
        typeof candidate.imap_secure === 'boolean'
          ? candidate.imap_secure
          : DEFAULT_CONFIG.imap_secure,
      password:
        typeof candidate.password === 'string' ? candidate.password : DEFAULT_CONFIG.password,
      smtp_host:
        typeof candidate.smtp_host === 'string' ? candidate.smtp_host : DEFAULT_CONFIG.smtp_host,
      smtp_port: this.normalizePort(candidate.smtp_port, DEFAULT_CONFIG.smtp_port),
      smtp_secure:
        typeof candidate.smtp_secure === 'boolean'
          ? candidate.smtp_secure
          : DEFAULT_CONFIG.smtp_secure,
      sync_delay_seconds: this.normalizeDelay(
        candidate.sync_delay_seconds,
        DEFAULT_CONFIG.sync_delay_seconds,
      ),
      updated_at: typeof candidate.updated_at === 'string' ? candidate.updated_at : null,
    };
  }

  private normalizePort(value: number | string | undefined, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(1, Math.floor(value));
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? Math.max(1, parsed) : fallback;
    }

    return fallback;
  }

  private normalizeDelay(value: number | string | undefined, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(5, Math.floor(value));
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? Math.max(5, parsed) : fallback;
    }

    return fallback;
  }
}
