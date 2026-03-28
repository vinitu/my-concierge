import { ConfigService } from '@nestjs/config';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GatewayEmailConfigService } from './gateway-email-config.service';
import { GatewayEmailRuntimeService } from './gateway-email-runtime.service';

describe('GatewayEmailRuntimeService', () => {
  it('groups email replies into the same conversation thread', async () => {
    const runtimeDirectory = await mkdtemp(join(tmpdir(), 'gateway-email-runtime-'));
    const configService = new GatewayEmailConfigService(
      new ConfigService({
        GATEWAY_EMAIL_RUNTIME_DIR: runtimeDirectory,
      }),
    );
    const service = new GatewayEmailRuntimeService(configService);

    const first = await service.ingestInbound('INBOX', {
      from: 'alice@example.com',
      in_reply_to: null,
      message_id: '<msg-1@example.com>',
      received_at: '2026-03-27T10:00:00.000Z',
      references: [],
      subject: 'Dinner plans',
      text: 'Can you help plan dinner?',
      to: ['assistant@example.com'],
      transport_uid: 1,
    });
    const second = await service.ingestInbound('INBOX', {
      from: 'alice@example.com',
      in_reply_to: '<msg-1@example.com>',
      message_id: '<msg-2@example.com>',
      received_at: '2026-03-27T10:05:00.000Z',
      references: ['<msg-1@example.com>'],
      subject: 'Re: Dinner plans',
      text: 'Following up on dinner.',
      to: ['assistant@example.com'],
      transport_uid: 2,
    });

    expect(second.conversation_id).toBe(first.conversation_id);
    const thread = await service.getThread(first.conversation_id);
    expect(thread.thread?.message_ids).toHaveLength(2);
    expect(thread.messages.map((message) => message.message_id)).toEqual([
      '<msg-1@example.com>',
      '<msg-2@example.com>',
    ]);
  });
});
