import { ConfigService } from '@nestjs/config';
import type { QueueMessage } from '../../assistant-api-app/queue/queue-adapter';
import { AssistantWorkerPromptService } from './assistant-worker-prompt.service';
import type { AssistantWorkerRuntimeContext } from './assistant-worker-runtime-context.service';
import { AssistantWorkerRuntimeContextService } from './assistant-worker-runtime-context.service';
import { GrokResponsesService } from './grok-responses.service';

describe('GrokResponsesService', () => {
  const runtimeContext: AssistantWorkerRuntimeContext = {
    agents: 'agent rules',
    datadir: '/runtime',
    identity: 'assistant identity',
    memory: [
      {
        content: 'remember this',
        path: 'memory/notes.md',
      },
    ],
    soul: 'assistant soul',
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
      new ConfigService({
        XAI_API_KEY: 'test-key',
      }),
      new AssistantWorkerPromptService(),
      runtimeContextService,
    );

    await expect(service.generateReply(queueMessage)).resolves.toBe('Kitchen lights are on.');

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
          content: expect.stringContaining('# AGENTS.md'),
          role: 'system',
        },
        {
          content: expect.stringContaining('Turn on the kitchen lights'),
          role: 'user',
        },
      ],
      model: 'grok-4',
      store: false,
    });
  });

  it('fails fast when XAI_API_KEY is missing', async () => {
    const runtimeContextService = {
      load: jest.fn().mockResolvedValue(runtimeContext),
    } as unknown as AssistantWorkerRuntimeContextService;
    const service = new GrokResponsesService(
      new ConfigService({}),
      new AssistantWorkerPromptService(),
      runtimeContextService,
    );

    await expect(service.generateReply(queueMessage)).rejects.toThrow(
      'XAI_API_KEY is required for assistant-worker',
    );
  });
});
