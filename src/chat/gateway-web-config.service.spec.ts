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
import {
  GatewayWebConfigService,
  GATEWAY_WEB_ALLOWED_INCOMING_MESSAGE_TYPES,
} from './gateway-web-config.service';

describe('GatewayWebConfigService', () => {
  it('creates and reads default config', async () => {
    const runtimeDirectory = await mkdtemp(join(tmpdir(), 'gateway-web-config-'));
    const service = new GatewayWebConfigService(
      new ConfigService({
        ASSISTANT_API_URL: 'http://assistant-api:3000',
        ASSISTANT_MEMORY_URL: 'http://assistant-memory:3000',
        GATEWAY_WEB_RUNTIME_DIR: runtimeDirectory,
        GATEWAY_WEB_USER_ID: 'default-user',
      }),
    );

    await expect(service.read()).resolves.toEqual({
      assistant_api_url: 'http://assistant-api:3000',
      assistant_memory_url: 'http://assistant-memory:3000',
      allowed_incoming_message_types: [...GATEWAY_WEB_ALLOWED_INCOMING_MESSAGE_TYPES],
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
        allowed_incoming_message_types: 'not-array' as unknown as never[],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unknown allowed incoming message types', async () => {
    const runtimeDirectory = await mkdtemp(join(tmpdir(), 'gateway-web-config-'));
    const service = new GatewayWebConfigService(
      new ConfigService({
        GATEWAY_WEB_RUNTIME_DIR: runtimeDirectory,
      }),
    );

    await expect(
      service.write({
        allowed_incoming_message_types: ['unknown.type'] as never[],
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
          allowed_incoming_message_types: ['unknown.type'],
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
        GATEWAY_WEB_RUNTIME_DIR: runtimeDirectory,
        GATEWAY_WEB_USER_ID: 'default-user',
      }),
    );

    await expect(service.read()).resolves.toEqual({
      assistant_api_url: 'http://assistant-api:3000',
      assistant_memory_url: 'http://assistant-memory:3000',
      allowed_incoming_message_types: [...GATEWAY_WEB_ALLOWED_INCOMING_MESSAGE_TYPES],
      user_id: 'default-user',
    });

    await expect(readFile(configPath, 'utf8')).resolves.toContain('assistant_memory_url');
  });
});
