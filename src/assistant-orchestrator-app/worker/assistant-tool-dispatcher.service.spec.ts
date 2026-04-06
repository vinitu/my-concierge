import { AssistantMemoryClientService } from './assistant-memory-client.service';
import { AssistantOrchestratorConfigService } from './assistant-orchestrator-config.service';
import { AssistantToolDispatcherService } from './assistant-tool-dispatcher.service';
import { AssistantOrchestratorConversationService } from './assistant-orchestrator-conversation.service';
import { BraveSearchService } from './brave-search.service';
import { mkdtemp, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('AssistantToolDispatcherService', () => {
  it('routes memory_search through assistant-memory', async () => {
    const service = new AssistantToolDispatcherService(
      {
        searchFederated: jest.fn().mockResolvedValue({
          count: 1,
          entries: [{ id: 'mem_1' }],
        }),
      } as unknown as AssistantMemoryClientService,
      {
        search: jest.fn(),
      } as unknown as BraveSearchService,
      {
        configPath: jest.fn(),
      } as unknown as AssistantOrchestratorConfigService,
      {
        searchThread: jest.fn(),
      } as unknown as AssistantOrchestratorConversationService,
    );

    await expect(
      service.execute(
        {
          arguments: { query: 'dinner' },
          name: 'memory_search',
        },
        'thread_1',
      ),
    ).resolves.toEqual({
      ok: true,
      result: {
        count: 1,
        entries: [{ id: 'mem_1' }],
      },
      tool_name: 'memory_search',
    });
  });

  it('routes typed memory search through assistant-memory kind endpoint', async () => {
    const service = new AssistantToolDispatcherService(
      {
        searchByKind: jest.fn().mockResolvedValue({
          count: 1,
          entries: [{ id: 'mem_fact_1' }],
        }),
      } as unknown as AssistantMemoryClientService,
      {
        search: jest.fn(),
      } as unknown as BraveSearchService,
      {
        configPath: jest.fn(),
      } as unknown as AssistantOrchestratorConfigService,
      {
        searchThread: jest.fn(),
      } as unknown as AssistantOrchestratorConversationService,
    );

    await expect(
      service.execute(
        {
          arguments: { query: 'birth date' },
          name: 'memory_fact_search',
        },
        'thread_1',
      ),
    ).resolves.toEqual({
      ok: true,
      result: {
        count: 1,
        entries: [{ id: 'mem_fact_1' }],
      },
      tool_name: 'memory_fact_search',
    });
  });

  it('routes memory_conversation_search through canonical conversation state', async () => {
    const service = new AssistantToolDispatcherService(
      {
        search: jest.fn(),
      } as unknown as AssistantMemoryClientService,
      {
        search: jest.fn(),
      } as unknown as BraveSearchService,
      {
        configPath: jest.fn(),
      } as unknown as AssistantOrchestratorConfigService,
      {
        searchThread: jest.fn().mockResolvedValue({
          messages: [],
          summary: 'Dinner planning is active.',
          thread_id: 'thread_1',
        }),
      } as unknown as AssistantOrchestratorConversationService,
    );

    await expect(
      service.execute(
        {
          arguments: { limit: 5 },
          name: 'memory_conversation_search',
        },
        'thread_1',
      ),
    ).resolves.toEqual({
      ok: true,
      result: {
        messages: [],
        summary: 'Dinner planning is active.',
        thread_id: 'thread_1',
      },
      tool_name: 'memory_conversation_search',
    });
  });

  it('routes web_search through Brave search', async () => {
    const service = new AssistantToolDispatcherService(
      {
        search: jest.fn(),
      } as unknown as AssistantMemoryClientService,
      {
        search: jest.fn().mockResolvedValue({
          query: 'latest nestjs release',
          results: [{ snippet: 'Release notes', title: 'NestJS', url: 'https://example.test' }],
        }),
      } as unknown as BraveSearchService,
      {
        configPath: jest.fn(),
      } as unknown as AssistantOrchestratorConfigService,
      {
        searchThread: jest.fn(),
      } as unknown as AssistantOrchestratorConversationService,
    );

    await expect(
      service.execute(
        {
          arguments: { count: 3, query: 'latest nestjs release' },
          name: 'web_search',
        },
        'thread_1',
      ),
    ).resolves.toEqual({
      ok: true,
      result: {
        query: 'latest nestjs release',
        results: [{ snippet: 'Release notes', title: 'NestJS', url: 'https://example.test' }],
      },
      tool_name: 'web_search',
    });
  });

  it('rejects disabled tools from assistant-orchestrator settings', async () => {
    const service = new AssistantToolDispatcherService(
      {
        search: jest.fn(),
      } as unknown as AssistantMemoryClientService,
      {
        search: jest.fn(),
      } as unknown as BraveSearchService,
      {
        configPath: jest.fn(),
      } as unknown as AssistantOrchestratorConfigService,
      {
        searchThread: jest.fn(),
      } as unknown as AssistantOrchestratorConversationService,
    );

    await expect(
      service.execute(
        {
          arguments: {},
          name: 'time_current',
        },
        'thread_1',
        ['memory_search'],
      ),
    ).rejects.toThrow('Tool is disabled in assistant-orchestrator settings: time_current');
  });

  it('loads a local runtime skill file for skill_execute', async () => {
    const runtimeDirectory = await mkdtemp(join(tmpdir(), 'orchestrator-skills-'));
    const configDirectory = join(runtimeDirectory, 'config');
    const skillsDirectory = join(runtimeDirectory, 'skills');
    await mkdir(configDirectory, { recursive: true });
    await mkdir(skillsDirectory, { recursive: true });
    await writeFile(
      join(skillsDirectory, 'shopping.md'),
      '# Shopping\n\nUse this skill for shopping tasks.\n',
      'utf8',
    );

    const service = new AssistantToolDispatcherService(
      {
        search: jest.fn(),
      } as unknown as AssistantMemoryClientService,
      {
        search: jest.fn(),
      } as unknown as BraveSearchService,
      {
        configPath: jest.fn().mockReturnValue(join(configDirectory, 'orchestrator.json')),
      } as unknown as AssistantOrchestratorConfigService,
      {
        searchThread: jest.fn(),
      } as unknown as AssistantOrchestratorConversationService,
    );

    await expect(
      service.execute(
        {
          arguments: { skill_name: 'shopping' },
          name: 'skill_execute',
        },
        'thread_1',
      ),
    ).resolves.toEqual({
      ok: true,
      result: {
        content: '# Shopping\n\nUse this skill for shopping tasks.',
        file_name: 'shopping.md',
        format: 'markdown',
        skill_name: 'shopping',
        status: 'loaded',
      },
      tool_name: 'skill_execute',
    });
  });

  it('supports sandboxed directory and file tools under assistant home', async () => {
    const runtimeDirectory = await mkdtemp(join(tmpdir(), 'orchestrator-files-'));
    const configDirectory = join(runtimeDirectory, 'config');
    const homeDirectory = join(runtimeDirectory, 'data');
    await mkdir(configDirectory, { recursive: true });
    await mkdir(homeDirectory, { recursive: true });

    const service = new AssistantToolDispatcherService(
      {
        search: jest.fn(),
      } as unknown as AssistantMemoryClientService,
      {
        search: jest.fn(),
      } as unknown as BraveSearchService,
      {
        configPath: jest.fn().mockReturnValue(join(configDirectory, 'orchestrator.json')),
        homePath: jest.fn().mockReturnValue(homeDirectory),
      } as unknown as AssistantOrchestratorConfigService,
      {
        searchThread: jest.fn(),
      } as unknown as AssistantOrchestratorConversationService,
    );

    await expect(
      service.execute(
        {
          arguments: { path: 'notes' },
          name: 'directory_create',
        },
        'thread_1',
      ),
    ).resolves.toEqual({
      ok: true,
      result: {
        created: true,
        path: 'notes',
      },
      tool_name: 'directory_create',
    });

    await expect(
      service.execute(
        {
          arguments: { content: 'hello', path: 'notes/today.txt' },
          name: 'file_write',
        },
        'thread_1',
      ),
    ).resolves.toEqual({
      ok: true,
      result: {
        bytes: 5,
        path: 'notes/today.txt',
        written: true,
      },
      tool_name: 'file_write',
    });

    await expect(
      service.execute(
        {
          arguments: { path: 'notes/today.txt' },
          name: 'file_read',
        },
        'thread_1',
      ),
    ).resolves.toEqual({
      ok: true,
      result: {
        content: 'hello',
        path: 'notes/today.txt',
      },
      tool_name: 'file_read',
    });

    await expect(
      service.execute(
        {
          arguments: { path: 'notes' },
          name: 'directory_list',
        },
        'thread_1',
      ),
    ).resolves.toEqual({
      ok: true,
      result: {
        entries: [
          {
            name: 'today.txt',
            path: 'notes/today.txt',
            type: 'file',
          },
        ],
        path: 'notes',
      },
      tool_name: 'directory_list',
    });

    await expect(
      service.execute(
        {
          arguments: { path: 'notes/today.txt' },
          name: 'file_delete',
        },
        'thread_1',
      ),
    ).resolves.toEqual({
      ok: true,
      result: {
        deleted: true,
        path: 'notes/today.txt',
      },
      tool_name: 'file_delete',
    });

    expect(await readdir(join(homeDirectory, 'notes'))).toEqual([]);

    await expect(
      service.execute(
        {
          arguments: { path: 'notes' },
          name: 'directory_delete',
        },
        'thread_1',
      ),
    ).resolves.toEqual({
      ok: true,
      result: {
        deleted: true,
        path: 'notes',
      },
      tool_name: 'directory_delete',
    });

    await expect(stat(join(homeDirectory, 'notes'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects filesystem paths that escape assistant home', async () => {
    const runtimeDirectory = await mkdtemp(join(tmpdir(), 'orchestrator-files-'));
    const configDirectory = join(runtimeDirectory, 'config');
    const homeDirectory = join(runtimeDirectory, 'data');
    await mkdir(configDirectory, { recursive: true });
    await mkdir(homeDirectory, { recursive: true });

    const service = new AssistantToolDispatcherService(
      {
        search: jest.fn(),
      } as unknown as AssistantMemoryClientService,
      {
        search: jest.fn(),
      } as unknown as BraveSearchService,
      {
        configPath: jest.fn().mockReturnValue(join(configDirectory, 'orchestrator.json')),
        homePath: jest.fn().mockReturnValue(homeDirectory),
      } as unknown as AssistantOrchestratorConfigService,
      {
        searchThread: jest.fn(),
      } as unknown as AssistantOrchestratorConversationService,
    );

    await expect(
      service.execute(
        {
          arguments: { path: '../outside.txt' },
          name: 'file_write',
        },
        'thread_1',
      ),
    ).rejects.toThrow('Filesystem tool path escapes assistant home');
  });
});
