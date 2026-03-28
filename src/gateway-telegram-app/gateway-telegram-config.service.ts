import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { GatewayTelegramConfig } from './gateway-telegram-transport';

export interface UpdateGatewayTelegramConfigBody {
  bot_token?: string;
}

const DEFAULT_CONFIG: GatewayTelegramConfig = {
  bot_token: '',
  updated_at: null,
};

@Injectable()
export class GatewayTelegramConfigService {
  constructor(private readonly configService: ConfigService) {}

  async read(): Promise<GatewayTelegramConfig> {
    try {
      const raw = await readFile(this.configPath(), 'utf8');
      return this.normalize(JSON.parse(raw) as Partial<GatewayTelegramConfig>);
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

  async write(body: UpdateGatewayTelegramConfigBody): Promise<GatewayTelegramConfig> {
    const current = await this.read();
    const next: GatewayTelegramConfig = {
      bot_token:
        typeof body.bot_token === 'string'
          ? body.bot_token.trim()
          : current.bot_token,
      updated_at: new Date().toISOString(),
    };

    await mkdir(dirname(this.configPath()), { recursive: true });
    await writeFile(this.configPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return next;
  }

  isReady(config: GatewayTelegramConfig): boolean {
    return config.bot_token.length > 0;
  }

  runtimeDirectory(): string {
    return this.configService.get<string>(
      'GATEWAY_TELEGRAM_RUNTIME_DIR',
      join(process.cwd(), 'runtime', 'gateway-telegram'),
    );
  }

  private configPath(): string {
    return join(this.runtimeDirectory(), 'config', 'gateway-telegram.json');
  }

  private normalize(candidate: Partial<GatewayTelegramConfig>): GatewayTelegramConfig {
    return {
      bot_token:
        typeof candidate.bot_token === 'string'
          ? candidate.bot_token
          : DEFAULT_CONFIG.bot_token,
      updated_at:
        typeof candidate.updated_at === 'string' ? candidate.updated_at : null,
    };
  }
}
