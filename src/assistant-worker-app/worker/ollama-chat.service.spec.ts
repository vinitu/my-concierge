import { ConfigService } from '@nestjs/config';
import type { QueueMessage } from '../../assistant-api-app/queue/queue-adapter';
import type { AssistantWorkerRuntimeContext } from './assistant-worker-runtime-context.service';
import { AssistantWorkerPromptService } from './assistant-worker-prompt.service';
import { AssistantWorkerRuntimeContextService } from './assistant-worker-runtime-context.service';
import { OllamaChatService } from './ollama-chat.service';

describe('OllamaChatService', () => {
  const runtimeContext: AssistantWorkerRuntimeContext = {
    agents: 'agent rules',
    datadir: '/runtime',
    identity: 'assistant identity',
    memory: [],
    soul: 'assistant soul',
  };
  const queueMessage: QueueMessage = {
    callback_url: 'http://gateway-web:3000/callbacks/assistant/alex',
    chat: 'direct',
    contact: 'alex',
    direction: 'api',
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
          content: 'Everything looks normal.',
        },
      }),
      ok: true,
    } as Response);
    const service = new OllamaChatService(
      new ConfigService({
        OLLAMA_BASE_URL: 'http://host.docker.internal:11434',
        OLLAMA_MODEL: 'gemma3:1b',
      }),
      new AssistantWorkerPromptService(),
      runtimeContextService,
    );

    await expect(service.generateReply(queueMessage)).resolves.toBe('Everything looks normal.');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://host.docker.internal:11434/api/chat',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }),
    );
  });
});
