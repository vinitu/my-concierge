import { AssistantMemoryClientService } from './assistant-memory-client.service';
import { AssistantToolDispatcherService } from './assistant-tool-dispatcher.service';
import { AssistantWorkerConversationService } from './assistant-worker-conversation.service';

describe('AssistantToolDispatcherService', () => {
  it('routes memory_search through assistant-memory', async () => {
    const service = new AssistantToolDispatcherService(
      {
        search: jest.fn().mockResolvedValue({
          count: 1,
          entries: [{ id: 'mem_1' }],
        }),
      } as unknown as AssistantMemoryClientService,
      {
        searchThread: jest.fn(),
      } as unknown as AssistantWorkerConversationService,
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

  it('routes conversation_search through canonical conversation state', async () => {
    const service = new AssistantToolDispatcherService(
      {
        search: jest.fn(),
      } as unknown as AssistantMemoryClientService,
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
          name: 'conversation_search',
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
      tool_name: 'conversation_search',
    });
  });
});
