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
});
