import { ConfigService } from '@nestjs/config';
import {
  mkdir,
  mkdtemp,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssistantOrchestratorRuntimeContextService } from './assistant-orchestrator-runtime-context.service';

describe('AssistantOrchestratorRuntimeContextService', () => {
  it('loads runtime files and memory entries from the assistant-orchestrator runtime directory', async () => {
    const datadir = await mkdtemp(join(tmpdir(), 'assistant-runtime-'));
    const memoryDir = join(datadir, 'memory', 'notes');

    await mkdir(memoryDir, { recursive: true });
    await writeFile(join(datadir, 'SYSTEM.js'), '["agent rules"]', 'utf8');
    await writeFile(join(memoryDir, 'todo.md'), 'remember this', 'utf8');

    const service = new AssistantOrchestratorRuntimeContextService(
      new ConfigService({
        ASSISTANT_DATADIR: datadir,
      }),
    );

    await expect(service.load()).resolves.toEqual({
      agents: '["agent rules"]',
      datadir,
      identity: null,
      memory: [
        {
          content: 'remember this',
          path: 'memory/notes/todo.md',
        },
      ],
      soul: null,
    });
  });

  it('merges legacy SOUL.js and IDENTITY.js when SYSTEM.js is missing', async () => {
    const datadir = await mkdtemp(join(tmpdir(), 'assistant-runtime-legacy-'));
    await writeFile(join(datadir, 'SOUL.js'), '["Stay calm in the dialogue."]', 'utf8');
    await writeFile(join(datadir, 'IDENTITY.js'), '["Name: Sonya"]', 'utf8');

    const service = new AssistantOrchestratorRuntimeContextService(
      new ConfigService({
        ASSISTANT_DATADIR: datadir,
      }),
    );

    await expect(service.load()).resolves.toEqual({
      agents: JSON.stringify(['Name: Sonya', 'Stay calm in the dialogue.'], null, 2),
      datadir,
      identity: null,
      memory: [],
      soul: null,
    });
  });

  it('returns null or empty arrays when runtime files are missing', async () => {
    const datadir = await mkdtemp(join(tmpdir(), 'assistant-runtime-empty-'));
    const service = new AssistantOrchestratorRuntimeContextService(
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

  it('defaults to the assistant-orchestrator runtime directory inside the current working directory', async () => {
    const service = new AssistantOrchestratorRuntimeContextService(new ConfigService({}));

    await expect(service.load()).resolves.toMatchObject({
      datadir: join(process.cwd(), 'runtime', 'assistant-orchestrator'),
    });
  });
});
