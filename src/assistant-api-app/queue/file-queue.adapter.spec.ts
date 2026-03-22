import { ConfigService } from '@nestjs/config';
import {
  mkdtemp,
  readFile,
  readdir,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileQueueAdapter } from './file-queue.adapter';

describe('FileQueueAdapter', () => {
  it('writes accepted messages into the file queue directory', async () => {
    const queueDir = await mkdtemp(join(tmpdir(), 'assistant-api-queue-'));
    const adapter = new FileQueueAdapter(
      new ConfigService({
        FILE_QUEUE_DIR: queueDir,
      }),
    );

    await adapter.enqueue({
      callback_url: 'http://gateway-web/callbacks/assistant/socket-1',
      chat: 'direct',
      contact: 'socket-1',
      direction: 'api',
      message: 'hello',
    });

    const files = await readdir(queueDir);

    expect(files).toHaveLength(1);

    const content = await readFile(join(queueDir, files[0]), 'utf8');
    expect(content).toContain('"message": "hello"');
    expect(await adapter.depth()).toBe(1);
  });
});

