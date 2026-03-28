import { AssistantWorkerMetricsService } from '../observability/assistant-worker-metrics.service';
import { AssistantLangchainRuntimeService } from './assistant-langchain-runtime.service';
import type { AssistantLlmProvider } from './assistant-llm-provider';
import { AssistantToolDispatcherService } from './assistant-tool-dispatcher.service';
import { AssistantWorkerPromptTemplateService } from './assistant-worker-prompt-template.service';
import type { AssistantWorkerRuntimeContext } from './assistant-worker-runtime-context.service';
import { AssistantWorkerRuntimeContextService } from './assistant-worker-runtime-context.service';

describe('AssistantLangchainRuntimeService', () => {
  const input = {
    conversation: {
      chat: 'direct',
      contact: 'alex',
      context: 'Dinner planning is active.',
      direction: 'api',
      messages: [],
      updated_at: null,
    },
    message: {
      accepted_at: '2026-03-27T10:00:00.000Z',
      callback: { base_url: 'http://example.test' },
      chat: 'direct',
      conversation_id: 'thread_1',
      contact: 'alex',
      direction: 'api',
      message: 'What about dinner?',
      request_id: 'req_1',
    },
    retrieved_memory: [],
  };
  const runtimeContext: AssistantWorkerRuntimeContext = {
    agents: '[]',
    datadir: '/runtime',
    identity: '[]',
    memory: [],
    soul: '[]',
  };

  it('returns direct final result when planning step chooses no tool', async () => {
    const service = new AssistantLangchainRuntimeService(
      {
        generateText: jest
          .fn()
          .mockResolvedValueOnce(
            '{"final":{"message":"Dinner is at 19:00.","context":"Dinner is planned for 19:00.","memory_writes":[],"tool_observations":[]}}',
          ),
      } as unknown as AssistantLlmProvider,
      {
        execute: jest.fn(),
      } as unknown as AssistantToolDispatcherService,
      new AssistantWorkerMetricsService(),
      {
        renderPlanningPrompt: jest.fn().mockResolvedValue('planning prompt'),
        renderSynthesisPrompt: jest.fn(),
      } as unknown as AssistantWorkerPromptTemplateService,
      {
        load: jest.fn().mockResolvedValue(runtimeContext),
      } as unknown as AssistantWorkerRuntimeContextService,
    );

    await expect(service.run(input)).resolves.toEqual({
      context: 'Dinner is planned for 19:00.',
      memory_writes: [],
      message: 'Dinner is at 19:00.',
      tool_observations: [],
    });
  });

  it('executes one tool call and synthesizes final response', async () => {
    const service = new AssistantLangchainRuntimeService(
      {
        generateText: jest
          .fn()
          .mockResolvedValueOnce(
            '{"tool_call":{"name":"time_current","arguments":{}}}',
          )
          .mockResolvedValueOnce(
            '{"message":"It is dinner time.","context":"Current dinner planning is active.","memory_writes":[],"tool_observations":[]}',
          ),
      } as unknown as AssistantLlmProvider,
      {
        execute: jest.fn().mockResolvedValue({
          ok: true,
          result: {
            iso: '2026-03-27T10:00:00.000Z',
            timezone: 'Europe/Warsaw',
          },
          tool_name: 'time_current',
        }),
      } as unknown as AssistantToolDispatcherService,
      new AssistantWorkerMetricsService(),
      {
        renderPlanningPrompt: jest.fn().mockResolvedValue('planning prompt'),
        renderSynthesisPrompt: jest.fn().mockResolvedValue('synthesis prompt'),
      } as unknown as AssistantWorkerPromptTemplateService,
      {
        load: jest.fn().mockResolvedValue(runtimeContext),
      } as unknown as AssistantWorkerRuntimeContextService,
    );

    await expect(service.run(input)).resolves.toEqual({
      context: 'Current dinner planning is active.',
      memory_writes: [],
      message: 'It is dinner time.',
      tool_observations: [
        {
          ok: true,
          result: {
            iso: '2026-03-27T10:00:00.000Z',
            timezone: 'Europe/Warsaw',
          },
          tool_name: 'time_current',
        },
      ],
    });
  });

  it('rejects a disabled tool even if the planning step returns it', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(
        new Error('Tool is disabled in assistant-worker settings: time_current'),
      );
    const generateText = jest
      .fn()
      .mockResolvedValueOnce('{"tool_call":{"name":"time_current","arguments":{}}}')
      .mockResolvedValueOnce('{"tool_call":{"name":"time_current","arguments":{}}}');
    const service = new AssistantLangchainRuntimeService(
      {
        generateText,
      } as unknown as AssistantLlmProvider,
      {
        execute,
      } as unknown as AssistantToolDispatcherService,
      new AssistantWorkerMetricsService(),
      {
        renderPlanningPrompt: jest.fn().mockResolvedValue('planning prompt'),
        renderSynthesisPrompt: jest.fn(),
      } as unknown as AssistantWorkerPromptTemplateService,
      {
        load: jest.fn().mockResolvedValue(runtimeContext),
      } as unknown as AssistantWorkerRuntimeContextService,
    );

    await expect(service.run(input, ['memory_search_federated'])).rejects.toThrow(
      'Tool is disabled in assistant-worker settings: time_current',
    );
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(execute).not.toHaveBeenCalled();
  });

  it('retries planning once when the model selects a disabled tool', async () => {
    const generateText = jest
      .fn()
      .mockResolvedValueOnce('{"tool_call":{"name":"time_current","arguments":{}}}')
      .mockResolvedValueOnce(
        '{"final":{"message":"Dinner is at 19:00.","context":"Dinner is planned for 19:00.","memory_writes":[],"tool_observations":[]}}',
      );
    const renderPlanningPrompt = jest.fn().mockResolvedValue('planning prompt');
    const service = new AssistantLangchainRuntimeService(
      {
        generateText,
      } as unknown as AssistantLlmProvider,
      {
        execute: jest.fn(),
      } as unknown as AssistantToolDispatcherService,
      new AssistantWorkerMetricsService(),
      {
        renderPlanningPrompt,
        renderSynthesisPrompt: jest.fn(),
      } as unknown as AssistantWorkerPromptTemplateService,
      {
        load: jest.fn().mockResolvedValue(runtimeContext),
      } as unknown as AssistantWorkerRuntimeContextService,
    );

    await expect(service.run(input, ['memory_search_federated'])).resolves.toEqual({
      context: 'Dinner is planned for 19:00.',
      memory_writes: [],
      message: 'Dinner is at 19:00.',
      tool_observations: [],
    });
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(renderPlanningPrompt).toHaveBeenCalledTimes(2);
  });

  it('accepts fenced planning JSON output', async () => {
    const service = new AssistantLangchainRuntimeService(
      {
        generateText: jest.fn().mockResolvedValueOnce(
          '```json\n{"final":{"message":"Привет!","context":"Greeting context.","memory_writes":[],"tool_observations":[]}}\n```',
        ),
      } as unknown as AssistantLlmProvider,
      {
        execute: jest.fn(),
      } as unknown as AssistantToolDispatcherService,
      new AssistantWorkerMetricsService(),
      {
        renderPlanningPrompt: jest.fn().mockResolvedValue('planning prompt'),
        renderSynthesisPrompt: jest.fn(),
      } as unknown as AssistantWorkerPromptTemplateService,
      {
        load: jest.fn().mockResolvedValue(runtimeContext),
      } as unknown as AssistantWorkerRuntimeContextService,
    );

    await expect(service.run(input)).resolves.toEqual({
      context: 'Greeting context.',
      memory_writes: [],
      message: 'Привет!',
      tool_observations: [],
    });
  });

  it('repairs malformed planning output once and continues', async () => {
    const service = new AssistantLangchainRuntimeService(
      {
        generateText: jest
          .fn()
          .mockResolvedValueOnce('{"behavior":["echo"],"available_tools":[]}')
          .mockResolvedValueOnce(
            '{"final":{"message":"Fixed after repair.","context":"Repair path.","memory_writes":[],"tool_observations":[]}}',
          ),
      } as unknown as AssistantLlmProvider,
      {
        execute: jest.fn(),
      } as unknown as AssistantToolDispatcherService,
      new AssistantWorkerMetricsService(),
      {
        renderPlanningPrompt: jest.fn().mockResolvedValue('planning prompt'),
        renderSynthesisPrompt: jest.fn(),
      } as unknown as AssistantWorkerPromptTemplateService,
      {
        load: jest.fn().mockResolvedValue(runtimeContext),
      } as unknown as AssistantWorkerRuntimeContextService,
    );

    await expect(service.run(input)).resolves.toEqual({
      context: 'Repair path.',
      memory_writes: [],
      message: 'Fixed after repair.',
      tool_observations: [],
    });
  });

  it('normalizes invalid tool_call shape from weak model output', async () => {
    const service = new AssistantLangchainRuntimeService(
      {
        generateText: jest
          .fn()
          .mockResolvedValueOnce(
            '{"tool_call":{"name":"time_current|web_search|conversation_search"}}',
          )
          .mockResolvedValueOnce(
            '{"message":"Done.","context":"Tool normalized.","memory_writes":[],"tool_observations":[]}',
          ),
      } as unknown as AssistantLlmProvider,
      {
        execute: jest.fn().mockResolvedValue({
          ok: true,
          result: { iso: '2026-03-27T10:00:00.000Z' },
          tool_name: 'time_current',
        }),
      } as unknown as AssistantToolDispatcherService,
      new AssistantWorkerMetricsService(),
      {
        renderPlanningPrompt: jest.fn().mockResolvedValue('planning prompt'),
        renderSynthesisPrompt: jest.fn().mockResolvedValue('synthesis prompt'),
      } as unknown as AssistantWorkerPromptTemplateService,
      {
        load: jest.fn().mockResolvedValue(runtimeContext),
      } as unknown as AssistantWorkerRuntimeContextService,
    );

    await expect(service.run(input)).resolves.toEqual({
      context: 'Tool normalized.',
      memory_writes: [],
      message: 'Done.',
      tool_observations: [
        {
          ok: true,
          result: { iso: '2026-03-27T10:00:00.000Z' },
          tool_name: 'time_current',
        },
      ],
    });
  });

  it('returns user-friendly fallback when planning cannot be repaired', async () => {
    const service = new AssistantLangchainRuntimeService(
      {
        generateText: jest
          .fn()
          .mockResolvedValueOnce(
            '{"current_user_message":{"message":"привет"},"available_tools":[{"name":"time_current"}]}',
          )
          .mockResolvedValueOnce('{"still":"invalid"}'),
      } as unknown as AssistantLlmProvider,
      {
        execute: jest.fn(),
      } as unknown as AssistantToolDispatcherService,
      new AssistantWorkerMetricsService(),
      {
        renderPlanningPrompt: jest.fn().mockResolvedValue('planning prompt'),
        renderSynthesisPrompt: jest.fn(),
      } as unknown as AssistantWorkerPromptTemplateService,
      {
        load: jest.fn().mockResolvedValue(runtimeContext),
      } as unknown as AssistantWorkerRuntimeContextService,
    );

    await expect(service.run(input)).resolves.toEqual({
      context: 'LLM planning output was invalid and fallback response was used.',
      memory_writes: [],
      message:
        'Не удалось корректно обработать ответ модели. Попробуйте выбрать другую LLM модель в настройках.',
      tool_observations: [],
    });
  });
});
