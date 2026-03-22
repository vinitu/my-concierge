import { ConfigService } from '@nestjs/config';
import type { QueueMessage } from '../../assistant-api-app/queue/queue-adapter';
import { AssistantWorkerConfigService } from './assistant-worker-config.service';
import type { AssistantWorkerRuntimeContext } from './assistant-worker-runtime-context.service';
import { AssistantWorkerPromptService } from './assistant-worker-prompt.service';
import { AssistantWorkerPromptTemplateService } from './assistant-worker-prompt-template.service';
import { AssistantWorkerRuntimeContextService } from './assistant-worker-runtime-context.service';
import { DeepseekChatService } from './deepseek-chat.service';

describe('DeepseekChatService', () => {
  const runtimeContext: AssistantWorkerRuntimeContext = {
    agents: '["agent rules"]',
    datadir: '/runtime',
    identity: '["assistant identity"]',
    memory: [],
    soul: `[
  "Stay calm in the dialogue.",
  "Preserve a natural conversational tone.",
  "Be direct and practical."
]`,
  };
  const queueMessage: QueueMessage = {
    chat: 'direct',
    conversation_id: 'alex',
    contact: 'alex',
    direction: 'api',
    host: 'http://gateway-web:3000',
    message: 'Summarize the house status',
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends an OpenAI-compatible chat request to DeepSeek and returns assistant text', async () => {
    const runtimeContextService = {
      load: jest.fn().mockResolvedValue(runtimeContext),
    } as unknown as AssistantWorkerRuntimeContextService;
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"message":"Everything looks normal.","context":"The active topic is current house status."}',
            },
          },
        ],
      }),
      ok: true,
    } as Response);
    const service = new DeepseekChatService(
      {
        read: jest.fn().mockResolvedValue({ memory_window: 3, model: 'deepseek-reasoner', provider: 'deepseek' }),
      } as unknown as AssistantWorkerConfigService,
      new ConfigService({
        ASSISTANT_DATADIR: '/runtime',
        DEEPSEEK_API_KEY: 'test-key',
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
          context: 'Home status updates should be short.',
          direction: 'api',
          messages: [],
          updated_at: null,
        },
        message: queueMessage,
      }),
    ).resolves.toEqual({
      context: 'The active topic is current house status.',
      message: 'Everything looks normal.',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
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

    expect(JSON.parse(init.body).model).toBe('deepseek-reasoner');
  });

  it('fails fast when DEEPSEEK_API_KEY is missing', async () => {
    const runtimeContextService = {
      load: jest.fn().mockResolvedValue(runtimeContext),
    } as unknown as AssistantWorkerRuntimeContextService;
    const service = new DeepseekChatService(
      {
        read: jest.fn().mockResolvedValue({ memory_window: 3, model: 'deepseek-chat', provider: 'deepseek' }),
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
    ).rejects.toThrow('DEEPSEEK_API_KEY is required for assistant-worker');
  });
});
