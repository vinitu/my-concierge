import { ConfigService } from '@nestjs/config';
import type { QueueMessage } from '../../assistant-api-app/queue/queue-adapter';
import { AssistantWorkerConfigService } from './assistant-worker-config.service';
import { AssistantWorkerPromptService } from './assistant-worker-prompt.service';
import { AssistantWorkerPromptTemplateService } from './assistant-worker-prompt-template.service';
import type { AssistantWorkerRuntimeContext } from './assistant-worker-runtime-context.service';
import { AssistantWorkerRuntimeContextService } from './assistant-worker-runtime-context.service';
import { GrokResponsesService } from './grok-responses.service';

describe('GrokResponsesService', () => {
  const runtimeContext: AssistantWorkerRuntimeContext = {
    agents: '["agent rules"]',
    datadir: '/runtime',
    identity: '["assistant identity"]',
    memory: [
      {
        content: 'remember this',
        path: 'memory/notes.md',
      },
    ],
    soul: `[
  "Stay calm in the dialogue.",
  "Preserve a natural conversational tone.",
  "Be direct and practical.",
  "Keep responses concise by default.",
  "Be helpful without unnecessary explanation."
]`,
  };
  const queueMessage: QueueMessage = {
    callback_url: 'http://gateway-web:3000/callbacks/assistant/alex',
    chat: 'direct',
    contact: 'alex',
    direction: 'api',
    message: 'Turn on the kitchen lights',
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends the worker prompt to xAI Responses API and returns assistant text', async () => {
    const runtimeContextService = {
      load: jest.fn().mockResolvedValue(runtimeContext),
    } as unknown as AssistantWorkerRuntimeContextService;
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({
        output: [
          {
            content: [
              {
                text: '{"message":"Kitchen lights are on.","context":"The kitchen lights are currently on."}',
                type: 'output_text',
              },
            ],
            role: 'assistant',
            type: 'message',
          },
        ],
      }),
      ok: true,
    } as Response);
    const service = new GrokResponsesService(
      {
        read: jest.fn().mockResolvedValue({ memory_window: 3, model: 'grok-4-latest', provider: 'xai' }),
      } as unknown as AssistantWorkerConfigService,
      new ConfigService({
        ASSISTANT_DATADIR: '/runtime',
        XAI_API_KEY: 'test-key',
      }),
      new AssistantWorkerPromptTemplateService(
        new ConfigService({
          ASSISTANT_DATADIR: '/runtime',
        }),
        new AssistantWorkerPromptService(),
      ),
      runtimeContextService,
    );

    await expect(
      service.generateReply({
        conversation: {
          chat: 'direct',
          contact: 'alex',
          context: 'Alex prefers concise updates.',
          direction: 'api',
          messages: [
            {
              content: 'How is the kitchen?',
              created_at: '2026-03-22T10:00:00.000Z',
              role: 'user',
            },
          ],
          updated_at: '2026-03-22T10:00:00.000Z',
        },
        message: queueMessage,
      }),
    ).resolves.toEqual({
      context: 'The kitchen lights are currently on.',
      message: 'Kitchen lights are on.',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.x.ai/v1/responses',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
          'Content-Type': 'application/json',
        }),
        method: 'POST',
      }),
    );

    const call = fetchMock.mock.calls[0];
    const init = call?.[1];

    if (!init || typeof init.body !== 'string') {
      throw new Error('fetch body is missing');
    }

    expect(JSON.parse(init.body)).toEqual({
      input: [
        {
          content: expect.stringContaining('"system_instructions": ['),
          role: 'system',
        },
      ],
      model: 'grok-4-latest',
      store: false,
    });
    expect(JSON.parse(init.body).input[0].content).toContain('"system_instructions": [');
    expect(JSON.parse(init.body).input[0].content).toContain('"agent rules"');
    expect(JSON.parse(init.body).input[0].content).toContain('Turn on the kitchen lights');
  });

  it('fails fast when XAI_API_KEY is missing', async () => {
    const runtimeContextService = {
      load: jest.fn().mockResolvedValue(runtimeContext),
    } as unknown as AssistantWorkerRuntimeContextService;
    const service = new GrokResponsesService(
      {
        read: jest.fn().mockResolvedValue({ memory_window: 3, model: 'grok-4', provider: 'xai' }),
      } as unknown as AssistantWorkerConfigService,
      new ConfigService({
        ASSISTANT_DATADIR: '/runtime',
      }),
      new AssistantWorkerPromptTemplateService(
        new ConfigService({
          ASSISTANT_DATADIR: '/runtime',
        }),
        new AssistantWorkerPromptService(),
      ),
      runtimeContextService,
    );

    await expect(
      service.generateReply({
        conversation: {
          chat: 'direct',
          contact: 'alex',
          context: '',
          direction: 'api',
          messages: [],
          updated_at: null,
        },
        message: queueMessage,
      }),
    ).rejects.toThrow(
      'XAI_API_KEY is required for assistant-worker',
    );
  });

  it('rejects non-json assistant replies from xAI', async () => {
    const runtimeContextService = {
      load: jest.fn().mockResolvedValue(runtimeContext),
    } as unknown as AssistantWorkerRuntimeContextService;
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({
        output: [
          {
            content: [
              {
                text: 'Kitchen lights are on.',
                type: 'output_text',
              },
            ],
            role: 'assistant',
            type: 'message',
          },
        ],
      }),
      ok: true,
    } as Response);
    const service = new GrokResponsesService(
      {
        read: jest.fn().mockResolvedValue({ memory_window: 3, model: 'grok-4', provider: 'xai' }),
      } as unknown as AssistantWorkerConfigService,
      new ConfigService({
        ASSISTANT_DATADIR: '/runtime',
        XAI_API_KEY: 'test-key',
      }),
      new AssistantWorkerPromptTemplateService(
        new ConfigService({
          ASSISTANT_DATADIR: '/runtime',
        }),
        new AssistantWorkerPromptService(),
      ),
      runtimeContextService,
    );

    await expect(
      service.generateReply({
        conversation: {
          chat: 'direct',
          contact: 'alex',
          context: '',
          direction: 'api',
          messages: [],
          updated_at: null,
        },
        message: queueMessage,
      }),
    ).rejects.toThrow('LLM response must be valid JSON');
  });
});
