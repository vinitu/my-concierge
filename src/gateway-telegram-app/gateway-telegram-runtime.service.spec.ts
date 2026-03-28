import { ConfigService } from '@nestjs/config';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GatewayTelegramConfigService } from './gateway-telegram-config.service';
import { GatewayTelegramRuntimeService } from './gateway-telegram-runtime.service';

describe('GatewayTelegramRuntimeService', () => {
  it('groups telegram replies into the same conversation thread', async () => {
    const runtimeDirectory = await mkdtemp(join(tmpdir(), 'gateway-telegram-runtime-'));
    const configService = new GatewayTelegramConfigService(
      new ConfigService({
        GATEWAY_TELEGRAM_RUNTIME_DIR: runtimeDirectory,
      }),
    );
    const service = new GatewayTelegramRuntimeService(configService);

    const first = await service.ingestInbound({
      chat_id: '12345',
      from_id: '77',
      from_username: 'alice',
      message_id: 1001,
      message_thread_id: null,
      received_at: '2026-03-27T10:00:00.000Z',
      text: 'Can you help plan dinner?',
    });
    const second = await service.ingestInbound({
      chat_id: '12345',
      from_id: '77',
      from_username: 'alice',
      message_id: 1002,
      message_thread_id: null,
      received_at: '2026-03-27T10:05:00.000Z',
      text: 'Following up on dinner.',
    });

    expect(second.conversation_id).toBe(first.conversation_id);
    const thread = await service.getThread(first.conversation_id);
    expect(thread.thread?.message_ids).toHaveLength(2);
    expect(thread.messages.map((message) => message.telegram_message_id)).toEqual([
      1001,
      1002,
    ]);
  });
});
