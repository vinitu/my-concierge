import { AssistantMemoryClientService } from './assistant-memory-client.service';
import { AssistantToolDispatcherService } from './assistant-tool-dispatcher.service';
import { AssistantWorkerConversationService } from './assistant-worker-conversation.service';
import { BraveSearchService } from './brave-search.service';

describe('AssistantToolDispatcherService', () => {
  it('routes mem_search through assistant-memory', async () => {
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
        searchThread: jest.fn(),
      } as unknown as AssistantWorkerConversationService,
    );

    await expect(
      service.execute(
        {
          arguments: { query: 'dinner' },
          name: 'mem_search',
        },
        'thread_1',
      ),
    ).resolves.toEqual({
      ok: true,
      result: {
        count: 1,
        entries: [{ id: 'mem_1' }],
      },
      tool_name: 'mem_search',
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
        searchThread: jest.fn(),
      } as unknown as AssistantWorkerConversationService,
    );

    await expect(
      service.execute(
        {
          arguments: { query: 'birth date' },
          name: 'mem_fact_search',
        },
        'thread_1',
      ),
    ).resolves.toEqual({
      ok: true,
      result: {
        count: 1,
        entries: [{ id: 'mem_fact_1' }],
      },
      tool_name: 'mem_fact_search',
    });
  });

  it('routes mem_conversation_search through canonical conversation state', async () => {
    const service = new AssistantToolDispatcherService(
      {
        search: jest.fn(),
      } as unknown as AssistantMemoryClientService,
      {
        search: jest.fn(),
      } as unknown as BraveSearchService,
      {
        searchThread: jest.fn().mockResolvedValue({
          messages: [],
          summary: 'Dinner planning is active.',
          thread_id: 'thread_1',
        }),
      } as unknown as AssistantWorkerConversationService,
    );

    await expect(
      service.execute(
        {
          arguments: { limit: 5 },
          name: 'mem_conversation_search',
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
      tool_name: 'mem_conversation_search',
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
        searchThread: jest.fn(),
      } as unknown as AssistantWorkerConversationService,
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

  it('rejects disabled tools from assistant-worker settings', async () => {
    const service = new AssistantToolDispatcherService(
      {
        search: jest.fn(),
      } as unknown as AssistantMemoryClientService,
      {
        search: jest.fn(),
      } as unknown as BraveSearchService,
      {
        searchThread: jest.fn(),
      } as unknown as AssistantWorkerConversationService,
    );

    await expect(
      service.execute(
        {
          arguments: {},
          name: 'time_current',
        },
        'thread_1',
        ['mem_search'],
      ),
    ).rejects.toThrow('Tool is disabled in assistant-worker settings: time_current');
  });
});
