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
      model: 'grok-4',
      memory_window: 3,
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

    await expect(service.write({ memory_window: 3, model: 'grok-4', provider: 'xai' })).resolves.toEqual({
      model: 'grok-4',
      memory_window: 3,
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

    await expect(service.write({ memory_window: 9, model: 'deepseek-r1:latest', provider: 'OLLAMA' as never })).resolves.toEqual({
      model: 'deepseek-r1:latest',
      memory_window: 9,
      provider: 'ollama',
    });

    await expect(service.write({ memory_window: 9, model: 'deepseek-reasoner', provider: 'DEEPSEEK' as never })).resolves.toEqual({
      model: 'deepseek-reasoner',
      memory_window: 9,
      provider: 'deepseek',
    });
  });
});
