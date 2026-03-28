import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GatewayWebConfigService } from './gateway-web-config.service';

describe('GatewayWebConfigService', () => {
  it('creates and reads default config', async () => {
    const runtimeDirectory = await mkdtemp(join(tmpdir(), 'gateway-web-config-'));
    const service = new GatewayWebConfigService(
      new ConfigService({
        ASSISTANT_API_URL: 'http://assistant-api:3000',
        ASSISTANT_MEMORY_URL: 'http://assistant-memory:3000',
        CALLBACK_BASE_URL: 'http://gateway-web:3000',
        GATEWAY_WEB_RUNTIME_DIR: runtimeDirectory,
        GATEWAY_WEB_USER_ID: 'default-user',
      }),
    );

    await expect(service.read()).resolves.toEqual({
      assistant_api_url: 'http://assistant-api:3000',
      assistant_memory_url: 'http://assistant-memory:3000',
      callback_base_url: 'http://gateway-web:3000',
      user_id: 'default-user',
    });
  });

  it('rejects invalid write payload with clear validation error', async () => {
    const runtimeDirectory = await mkdtemp(join(tmpdir(), 'gateway-web-config-'));
    const service = new GatewayWebConfigService(
      new ConfigService({
        GATEWAY_WEB_RUNTIME_DIR: runtimeDirectory,
      }),
    );

    await expect(
      service.write({
        assistant_api_url: 'not-a-url',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('falls back to defaults when stored config contains invalid URL or user_id', async () => {
    const runtimeDirectory = await mkdtemp(join(tmpdir(), 'gateway-web-config-'));
    const configPath = join(runtimeDirectory, 'config', 'gateway-web.json');
    await mkdir(join(runtimeDirectory, 'config'), { recursive: true });
    await writeFile(
      configPath,
      `${JSON.stringify(
        {
          assistant_api_url: 'invalid-url',
          assistant_memory_url: 'http://assistant-memory:3000',
          callback_base_url: 'ftp://bad',
          user_id: ' ',
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    const service = new GatewayWebConfigService(
      new ConfigService({
        ASSISTANT_API_URL: 'http://assistant-api:3000',
        ASSISTANT_MEMORY_URL: 'http://assistant-memory:3000',
        CALLBACK_BASE_URL: 'http://gateway-web:3000',
        GATEWAY_WEB_RUNTIME_DIR: runtimeDirectory,
        GATEWAY_WEB_USER_ID: 'default-user',
      }),
    );

    await expect(service.read()).resolves.toEqual({
      assistant_api_url: 'http://assistant-api:3000',
      assistant_memory_url: 'http://assistant-memory:3000',
      callback_base_url: 'http://gateway-web:3000',
      user_id: 'default-user',
    });

    await expect(readFile(configPath, 'utf8')).resolves.toContain('assistant_memory_url');
  });
});
