import { AssistantWorkerPromptService } from './assistant-worker-prompt.service';
import { AssistantToolCatalogService } from './assistant-tool-catalog.service';
import type { AssistantWorkerRuntimeContext } from './assistant-worker-runtime-context.service';

function createService(): AssistantWorkerPromptService {
  return new AssistantWorkerPromptService(new AssistantToolCatalogService());
}

describe('AssistantWorkerPromptService', () => {
  it('formats SYSTEM.js as a raw array', () => {
    const runtimeContext: AssistantWorkerRuntimeContext = {
      agents: `[
  "instruction 1",
  "instruction 2",
  "instruction 3"
]`,
      datadir: '/runtime',
      identity: null,
      memory: [],
      soul: null,
    };
    const service = createService();

    expect(service.buildAgentsSection(runtimeContext)).toBe(
      `[
  "instruction 1",
  "instruction 2",
  "instruction 3"
]`,
    );
  });

  it('formats SOUL.js as a raw array', () => {
    const runtimeContext: AssistantWorkerRuntimeContext = {
      agents: null,
      datadir: '/runtime',
      identity: null,
      memory: [],
      soul: `[
  "Stay calm in the dialogue.",
  "Preserve a natural conversational tone.",
  "Be direct and practical.",
  "Keep responses concise by default.",
  "Be helpful without unnecessary explanation."
]`,
    };
    const service = createService();

    expect(service.buildSoulSection(runtimeContext)).toBe(
      `[
  "Stay calm in the dialogue.",
  "Preserve a natural conversational tone.",
  "Be direct and practical.",
  "Keep responses concise by default.",
  "Be helpful without unnecessary explanation."
]`,
    );
  });

  it('formats IDENTITY.js as a raw array', () => {
    const runtimeContext: AssistantWorkerRuntimeContext = {
      agents: null,
      datadir: '/runtime',
      identity: `[
  "Name: MyConcierge",
  "Role: personal home assistant"
]`,
      memory: [],
      soul: null,
    };
    const service = createService();

    expect(service.buildIdentitySection(runtimeContext)).toBe(
      `[
  "Name: MyConcierge",
  "Role: personal home assistant"
]`,
    );
  });

  it('formats conversation context as a JSON string', () => {
    const service = createService();

    expect(
      service.buildConversationContextJsonSection({
        conversation: {
          chat: 'direct',
          contact: 'alex',
          context: 'The active topic is dinner planning.',
          direction: 'api',
          messages: [],
          updated_at: null,
        },
        message: {
          accepted_at: new Date().toISOString(),
          callback: { base_url: 'http://example.test' },
          chat: 'direct',
          conversation_id: 'alex',
          contact: 'alex',
          direction: 'api',
          message: 'hi',
          request_id: 'req-1',
        },
        retrieved_memory: [],
      }),
    ).toBe('"The active topic is dinner planning."');
  });

  it('formats recent conversation messages as JSON', () => {
    const service = createService();

    expect(
      service.buildRecentMessagesSection({
        conversation: {
          chat: 'direct',
          contact: 'alex',
          context: '',
          direction: 'api',
          messages: [
            {
              content: 'hello',
              created_at: '2026-03-22T10:00:00.000Z',
              role: 'user',
            },
          ],
          updated_at: null,
        },
        message: {
          accepted_at: new Date().toISOString(),
          callback: { base_url: 'http://example.test' },
          chat: 'direct',
          conversation_id: 'alex',
          contact: 'alex',
          direction: 'api',
          message: 'hi',
          request_id: 'req-1',
        },
        retrieved_memory: [],
      }),
    ).toBe(
      JSON.stringify(
        [
          {
            content: 'hello',
            created_at: '2026-03-22T10:00:00.000Z',
            role: 'user',
          },
        ],
        null,
        2,
      ),
    );
  });

  it('formats current user message as JSON', () => {
    const service = createService();

    expect(
      service.buildCurrentUserMessageSection({
        conversation: {
          chat: 'direct',
          contact: 'alex',
          context: '',
          direction: 'api',
          messages: [],
          updated_at: null,
        },
        message: {
          accepted_at: new Date().toISOString(),
          callback: { base_url: 'http://example.test' },
          chat: 'direct',
          conversation_id: 'alex',
          contact: 'alex',
          direction: 'api',
          message: 'hi',
          request_id: 'req-1',
        },
        retrieved_memory: [],
      }),
    ).toBe(
      JSON.stringify(
        {
          chat: 'direct',
          contact: 'alex',
          direction: 'api',
          message: 'hi',
        },
        null,
        2,
      ),
    );
  });

  it('formats the full request object as JSON', () => {
    const runtimeContext: AssistantWorkerRuntimeContext = {
      agents: '["instruction 1"]',
      datadir: '/runtime',
      identity: '["Name: MyConcierge"]',
      memory: [],
      soul: '["Stay calm"]',
    };
    const service = createService();

    expect(
      service.buildRequestSection(
        {
          conversation: {
            chat: 'direct',
            contact: 'alex',
            context: 'Current topic is dinner.',
            direction: 'api',
            messages: [
              {
                content: 'hello',
                created_at: '2026-03-22T10:00:00.000Z',
                role: 'user',
              },
            ],
            updated_at: null,
          },
          message: {
            accepted_at: new Date().toISOString(),
            callback: { base_url: 'http://example.test' },
            chat: 'direct',
            conversation_id: 'alex',
            contact: 'alex',
            direction: 'api',
            message: 'hi',
            request_id: 'req-1',
          },
          retrieved_memory: [
            {
              archivedAt: null,
              confidence: 0.88,
              content: 'Alex likes concise answers.',
              conversationThreadId: 'alex',
              createdAt: '2026-03-27T09:00:00.000Z',
              id: 'mem_1',
              kind: 'preference',
              lastAccessedAt: null,
              scope: 'conversation',
              source: 'assistant-worker',
              tags: ['api'],
              updatedAt: '2026-03-27T09:00:00.000Z',
            },
          ],
        },
        runtimeContext,
      ),
    ).toBe(
      JSON.stringify(
        {
          behavior: ['Stay calm'],
          available_tools: [
            {
              description: 'Return current date, time, and timezone-aware temporal context.',
              name: 'time_current',
              use_when: 'Current time or date is required to answer correctly.',
            },
            {
              description:
                'Search durable memory for relevant profile, fact, preference, project, routine, rule, or episode entries.',
              name: 'memory_search',
              use_when:
                'The answer depends on stable remembered facts or preferences not present in recent messages.',
            },
            {
              description:
                'Store durable memory candidates after the run passes memory write policy.',
              name: 'memory_write',
              use_when: 'New stable memory should be persisted after a run completes.',
            },
            {
              description:
                'Search recent canonical conversation turns and summaries for the current thread.',
              name: 'conversation_search',
              use_when:
                'Recent thread context must be reloaded beyond the current in-memory window.',
            },
            {
              description: 'Execute a registered assistant skill or integration action.',
              name: 'skill_execute',
              use_when: 'The assistant must call a skill or integration to complete the task.',
            },
          ],
          conversation_context: 'Current topic is dinner.',
          current_user_message: {
            chat: 'direct',
            contact: 'alex',
            direction: 'api',
            message: 'hi',
          },
          identity: ['Name: MyConcierge'],
          retrieved_memory: [
            {
              archivedAt: null,
              confidence: 0.88,
              content: 'Alex likes concise answers.',
              conversationThreadId: 'alex',
              createdAt: '2026-03-27T09:00:00.000Z',
              id: 'mem_1',
              kind: 'preference',
              lastAccessedAt: null,
              scope: 'conversation',
              source: 'assistant-worker',
              tags: ['api'],
              updatedAt: '2026-03-27T09:00:00.000Z',
            },
          ],
          recent_messages: [
            {
              content: 'hello',
              created_at: '2026-03-22T10:00:00.000Z',
              role: 'user',
            },
          ],
          system_instructions: ['instruction 1'],
          task: [
            'Answer as the assistant inside the dialogue.',
            'Preserve continuity with the conversation history, retrieved memory, and context.',
            'Use runtime instructions, retrieved memory, and conversation context when relevant.',
            'Update the compact conversation context for future turns.',
            'Keep the context short, useful, and reusable.',
            'Keep stable user facts when they matter.',
            'Keep the active conversation topic when it matters.',
            'Keep important entities, decisions, preferences, and unresolved questions when they matter.',
            'Prefer the documented tool catalog when external actions or retrieval are needed.',
            'Drop greetings, filler, repeated wording, gibberish, and temporary noise from the context.',
            'Do not reduce the context to language preference only when there is a more important active topic.',
            'If the dialogue is about a person, place, task, or problem, keep that active topic in the context.',
            'If there is nothing new to keep, return the existing context or an empty string.',
          ],
        },
        null,
        2,
      ),
    );
  });
});
