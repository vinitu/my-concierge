import { ConfigService } from '@nestjs/config';
import type { QueueMessage } from '../../assistant-api-app/queue/queue-adapter';
import { AssistantWorkerConfigService } from './assistant-worker-config.service';
import type { AssistantWorkerRuntimeContext } from './assistant-worker-runtime-context.service';
import { AssistantWorkerPromptService } from './assistant-worker-prompt.service';
import { AssistantWorkerPromptTemplateService } from './assistant-worker-prompt-template.service';
import { AssistantWorkerRuntimeContextService } from './assistant-worker-runtime-context.service';
import { OllamaChatService } from './ollama-chat.service';

describe('OllamaChatService', () => {
  const runtimeContext: AssistantWorkerRuntimeContext = {
    agents: '["agent rules"]',
    datadir: '/runtime',
    identity: '["assistant identity"]',
    memory: [],
    soul: `[
  "Stay calm in the dialogue.",
  "Preserve a natural conversational tone.",
  "Be direct and practical.",
  "Keep responses concise by default.",
  "Be helpful without unnecessary explanation."
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

  it('sends a non-streaming chat request to Ollama and returns assistant text', async () => {
    const runtimeContextService = {
      load: jest.fn().mockResolvedValue(runtimeContext),
    } as unknown as AssistantWorkerRuntimeContextService;
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({
        message: {
          content: '{"message":"Everything looks normal.","context":"Home status is normal."}',
        },
      }),
      ok: true,
    } as Response);
    const service = new OllamaChatService(
      {
        read: jest.fn().mockResolvedValue({ memory_window: 3, model: 'deepseek-r1:latest', provider: 'ollama' }),
      } as unknown as AssistantWorkerConfigService,
      new ConfigService({
        ASSISTANT_DATADIR: '/runtime',
        OLLAMA_BASE_URL: 'http://host.docker.internal:11434',
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
      context: 'Home status is normal.',
      message: 'Everything looks normal.',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://host.docker.internal:11434/api/chat',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    );
    const call = fetchMock.mock.calls[0];
    const init = call?.[1];

    if (!init || typeof init.body !== 'string') {
      throw new Error('fetch body is missing');
    }

    expect(JSON.parse(init.body).model).toBe('deepseek-r1:latest');
  });

  it('rejects non-json assistant replies from Ollama', async () => {
    const runtimeContextService = {
      load: jest.fn().mockResolvedValue(runtimeContext),
    } as unknown as AssistantWorkerRuntimeContextService;
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({
        message: {
          content: 'Everything looks normal.',
        },
      }),
      ok: true,
    } as Response);
    const service = new OllamaChatService(
      {
        read: jest.fn().mockResolvedValue({ memory_window: 3, model: 'gemma3:1b', provider: 'ollama' }),
      } as unknown as AssistantWorkerConfigService,
      new ConfigService({
        ASSISTANT_DATADIR: '/runtime',
        OLLAMA_BASE_URL: 'http://host.docker.internal:11434',
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
