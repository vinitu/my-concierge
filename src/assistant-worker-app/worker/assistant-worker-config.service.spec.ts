import { ConfigService } from '@nestjs/config';
import {
  mkdtemp,
  readFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssistantWorkerConfigService } from './assistant-worker-config.service';

describe('AssistantWorkerConfigService', () => {
  it('creates the default worker config when missing', async () => {
    const datadir = await mkdtemp(join(tmpdir(), 'assistant-worker-config-'));
    const service = new AssistantWorkerConfigService(
      new ConfigService({
        ASSISTANT_DATADIR: datadir,
      }),
    );

    await expect(service.read()).resolves.toEqual({
      provider: 'xai',
    });

    await expect(readFile(join(datadir, 'config', 'worker.json'), 'utf8')).resolves.toContain(
      '"provider": "xai"',
    );
  });

  it('writes the worker config to runtime/config/worker.json', async () => {
    const datadir = await mkdtemp(join(tmpdir(), 'assistant-worker-config-'));
    const service = new AssistantWorkerConfigService(
      new ConfigService({
        ASSISTANT_DATADIR: datadir,
      }),
    );

    await expect(service.write({ provider: 'xai' })).resolves.toEqual({
      provider: 'xai',
    });

    await expect(readFile(join(datadir, 'config', 'worker.json'), 'utf8')).resolves.toContain(
      '"provider": "xai"',
    );
  });

  it('normalizes supported provider values', async () => {
    const datadir = await mkdtemp(join(tmpdir(), 'assistant-worker-config-'));
    const service = new AssistantWorkerConfigService(
      new ConfigService({
        ASSISTANT_DATADIR: datadir,
      }),
    );

    await expect(service.write({ provider: 'OLLAMA' as never })).resolves.toEqual({
      provider: 'ollama',
    });
  });
});
