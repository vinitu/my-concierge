import { ConfigService } from '@nestjs/config';
import {
  mkdir,
  mkdtemp,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssistantWorkerRuntimeContextService } from './assistant-worker-runtime-context.service';

describe('AssistantWorkerRuntimeContextService', () => {
  it('loads runtime files and memory entries from datadir', async () => {
    const datadir = await mkdtemp(join(tmpdir(), 'assistant-runtime-'));
    const memoryDir = join(datadir, 'memory', 'notes');

    await mkdir(memoryDir, { recursive: true });
    await writeFile(join(datadir, 'AGENTS.md'), 'agent rules', 'utf8');
    await writeFile(join(datadir, 'SOUL.md'), 'assistant soul', 'utf8');
    await writeFile(join(datadir, 'IDENTITY.md'), 'assistant identity', 'utf8');
    await writeFile(join(memoryDir, 'todo.md'), 'remember this', 'utf8');

    const service = new AssistantWorkerRuntimeContextService(
      new ConfigService({
        ASSISTANT_DATADIR: datadir,
      }),
    );

    await expect(service.load()).resolves.toEqual({
      agents: 'agent rules',
      datadir,
      identity: 'assistant identity',
      memory: [
        {
          content: 'remember this',
          path: 'memory/notes/todo.md',
        },
      ],
      soul: 'assistant soul',
    });
  });

  it('returns null or empty arrays when runtime files are missing', async () => {
    const datadir = await mkdtemp(join(tmpdir(), 'assistant-runtime-empty-'));
    const service = new AssistantWorkerRuntimeContextService(
      new ConfigService({
        ASSISTANT_DATADIR: datadir,
      }),
    );

    await expect(service.load()).resolves.toEqual({
      agents: null,
      datadir,
      identity: null,
      memory: [],
      soul: null,
    });
  });

  it('defaults to the runtime directory inside the current working directory', async () => {
    const service = new AssistantWorkerRuntimeContextService(new ConfigService({}));

    await expect(service.load()).resolves.toMatchObject({
      datadir: join(process.cwd(), 'runtime'),
    });
  });
});
