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

  function providerStub(mainReplies: string[]): AssistantLlmProvider {
    const generateFromMessages = jest.fn();
    for (const reply of mainReplies) {
      generateFromMessages.mockResolvedValueOnce(reply);
    }

    return {
      generateFromMessages,
      summarizeConversation: jest.fn().mockResolvedValue('summary'),
    };
  }

  it('returns direct final result when planning chooses no tool', async () => {
    const service = new AssistantLangchainRuntimeService(
      providerStub([
        '{"final":{"message":"Dinner is at 19:00.","context":"Dinner is planned for 19:00.","memory_writes":[],"tool_observations":[]}}',
      ]),
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

  it('executes tool and synthesizes final response', async () => {
    const service = new AssistantLangchainRuntimeService(
      providerStub([
        '{"tool_call":{"name":"time_current","arguments":{}}}',
        '{"message":"It is dinner time.","context":"Current dinner planning is active.","memory_writes":[],"tool_observations":[]}',
      ]),
      {
        execute: jest.fn().mockResolvedValue({
          ok: true,
          result: { iso: '2026-03-27T10:00:00.000Z', timezone: 'Europe/Warsaw' },
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
          result: { iso: '2026-03-27T10:00:00.000Z', timezone: 'Europe/Warsaw' },
          tool_name: 'time_current',
        },
      ],
    });
  });

  it('normalizes weak model tool_call output', async () => {
    const service = new AssistantLangchainRuntimeService(
      providerStub([
        '{"tool_call":{"name":"time_current|web_search|mem_conversation_search"}}',
        '{"message":"Done.","context":"Tool normalized.","memory_writes":[],"tool_observations":[]}',
      ]),
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
      providerStub([
        '{"current_user_message":{"message":"привет"},"available_tools":[{"name":"time_current"}]}',
        '{"still":"invalid"}',
      ]),
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
      fallback_reason: 'planning_parse_failed',
      memory_writes: [],
      message:
        'Could not parse the model response correctly. Try selecting a different LLM model in settings.',
      tool_observations: [],
    });
  });

  it('converts plain text planning response into final message fallback', async () => {
    const service = new AssistantLangchainRuntimeService(
      providerStub(['Привет!']),
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
      context: '',
      fallback_reason: 'planning_plain_text',
      memory_writes: [],
      message: 'Привет!',
      tool_observations: [],
    });
  });

  it('summarizes conversation in separate call', async () => {
    const summarizeConversation = jest.fn().mockResolvedValue('updated summary');
    const service = new AssistantLangchainRuntimeService(
      {
        generateFromMessages: jest.fn().mockResolvedValue('{}'),
        summarizeConversation,
      } as unknown as AssistantLlmProvider,
      {
        execute: jest.fn(),
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

    await expect(service.summarizeConversation(input, 'Assistant reply')).resolves.toBe(
      'updated summary',
    );
    expect(summarizeConversation).toHaveBeenCalledTimes(1);
  });
});
