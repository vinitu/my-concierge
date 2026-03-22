import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GatewayWebRuntimeService } from './gateway-web-runtime.service';

describe('GatewayWebRuntimeService', () => {
  it('stores conversation history in the gateway-web runtime directory', async () => {
    const runtimeDirectory = await mkdtemp(join(tmpdir(), 'gateway-web-runtime-'));
    const service = new GatewayWebRuntimeService(
      new ConfigService({
        GATEWAY_WEB_RUNTIME_DIR: runtimeDirectory,
      }),
    );

    await service.appendUserMessage('session-1', 'hello');
    await service.appendAssistantMessage('session-1', 'hi');

    const stored = JSON.parse(
      await readFile(join(runtimeDirectory, 'conversations', 'session-1.json'), 'utf8'),
    ) as {
      messages: Array<{ content: string; role: string }>;
      session_id: string;
    };

    expect(stored.session_id).toBe('session-1');
    expect(stored.messages).toEqual([
      expect.objectContaining({ content: 'hello', role: 'user' }),
      expect.objectContaining({ content: 'hi', role: 'assistant' }),
    ]);
  });
});
