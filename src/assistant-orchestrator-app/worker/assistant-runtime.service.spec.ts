import { AssistantOrchestratorMetricsService } from "../observability/assistant-orchestrator-metrics.service";
import { AssistantRuntimeService } from "./assistant-runtime.service";
import type {
  AssistantLlmConversationRespondResponse,
  AssistantLlmProvider,
} from "./assistant-llm-provider";
import { AssistantToolDispatcherService } from "./assistant-tool-dispatcher.service";
import { AssistantOrchestratorPromptTemplateService } from "./assistant-orchestrator-prompt-template.service";
import type { AssistantOrchestratorRuntimeContext } from "./assistant-orchestrator-runtime-context.service";
import { AssistantOrchestratorRuntimeContextService } from "./assistant-orchestrator-runtime-context.service";

describe("AssistantRuntimeService", () => {
  const input = {
    conversation: {
      chat: "direct",
      user_id: "alex",
      context: "Dinner planning is active.",
      direction: "api",
      messages: [],
      updated_at: null,
    },
    message: {
      accepted_at: "2026-03-27T10:00:00.000Z",
      chat: "direct",
      conversation_id: "thread_1",

      user_id: "alex",

      direction: "api",
      message: "What about dinner?",
      request_id: "req_1",
    },
    retrieved_memory: [],
  };
  const runtimeContext: AssistantOrchestratorRuntimeContext = {
    agents: "[]",
    datadir: "/runtime",
    identity: "[]",
    memory: [],
    soul: "[]",
  };

  function providerStub(
    mainReplies: AssistantLlmConversationRespondResponse[],
  ): AssistantLlmProvider {
    const generateFromMessages = jest.fn();
    for (const reply of mainReplies) {
      generateFromMessages.mockResolvedValueOnce(reply);
    }

    return {
      generateFromMessages,
      summarizeConversation: jest.fn().mockResolvedValue("summary"),
    };
  }

  function promptTemplateStub(overrides?: {
    renderPlanningPrompt?: jest.Mock;
    renderSynthesisPrompt?: jest.Mock;
  }): AssistantOrchestratorPromptTemplateService {
    return {
      listAvailableTools: jest.fn().mockReturnValue([{ name: "time_current" }]),
      renderPlanningPrompt:
        overrides?.renderPlanningPrompt ??
        jest.fn().mockResolvedValue("planning prompt"),
      renderSynthesisPrompt:
        overrides?.renderSynthesisPrompt ?? jest.fn().mockResolvedValue("synthesis prompt"),
    } as unknown as AssistantOrchestratorPromptTemplateService;
  }

  it("returns direct final result when planning chooses no tool", async () => {
    const service = new AssistantRuntimeService(
      providerStub([
        {
          context: "Dinner is planned for 19:00.",
          memory_writes: [],
          message: "Dinner is at 19:00.",
          tool_observations: [],
          type: "final",
        },
      ]),
      {
        execute: jest.fn(),
      } as unknown as AssistantToolDispatcherService,
      new AssistantOrchestratorMetricsService(),
      promptTemplateStub({
        renderSynthesisPrompt: jest.fn(),
      }),
      {
        load: jest.fn().mockResolvedValue(runtimeContext),
      } as unknown as AssistantOrchestratorRuntimeContextService,
    );

    await expect(service.run(input)).resolves.toEqual({
      context: "Dinner is planned for 19:00.",
      memory_writes: [],
      message: "Dinner is at 19:00.",
      tool_observations: [],
    });
  });

  it("executes tool and synthesizes final response", async () => {
    const service = new AssistantRuntimeService(
      providerStub([
        {
          message: "",
          tool_arguments: {},
          tool_name: "time_current",
          type: "tool_call",
        },
        {
          context: "Current dinner planning is active.",
          memory_writes: [],
          message: "It is dinner time.",
          tool_observations: [],
          type: "final",
        },
      ]),
      {
        execute: jest.fn().mockResolvedValue({
          ok: true,
          result: {
            iso: "2026-03-27T10:00:00.000Z",
            timezone: "Europe/Warsaw",
          },
          tool_name: "time_current",
        }),
      } as unknown as AssistantToolDispatcherService,
      new AssistantOrchestratorMetricsService(),
      promptTemplateStub(),
      {
        load: jest.fn().mockResolvedValue(runtimeContext),
      } as unknown as AssistantOrchestratorRuntimeContextService,
    );

    await expect(service.run(input)).resolves.toEqual({
      context: "Current dinner planning is active.",
      memory_writes: [],
      message: "It is dinner time.",
      tool_observations: [
        {
          ok: true,
          result: {
            iso: "2026-03-27T10:00:00.000Z",
            timezone: "Europe/Warsaw",
          },
          tool_name: "time_current",
        },
      ],
    });
  });

  it("returns planning fallback when tool_name is unsupported", async () => {
    const service = new AssistantRuntimeService(
      providerStub([
        {
          message: "",
          tool_arguments: {},
          tool_name: "time_current|web_search|memory_conversation_search",
          type: "tool_call",
        },
      ]),
      {
        execute: jest.fn().mockResolvedValue({
          ok: true,
          result: { iso: "2026-03-27T10:00:00.000Z" },
          tool_name: "time_current",
        }),
      } as unknown as AssistantToolDispatcherService,
      new AssistantOrchestratorMetricsService(),
      promptTemplateStub(),
      {
        load: jest.fn().mockResolvedValue(runtimeContext),
      } as unknown as AssistantOrchestratorRuntimeContextService,
    );

    await expect(service.run(input)).resolves.toEqual({
      context:
        "LLM planning output was invalid and fallback response was used.",
      fallback_reason: "planning_parse_failed",
      memory_writes: [],
      message:
        "Could not parse the model response correctly. Try selecting a different LLM model in settings.",
      tool_observations: [],
    });
  });

  it("returns user-friendly fallback when planning output is invalid", async () => {
    const service = new AssistantRuntimeService(
      providerStub([
        {
          message: "",
          type: "final",
        },
      ]),
      {
        execute: jest.fn(),
      } as unknown as AssistantToolDispatcherService,
      new AssistantOrchestratorMetricsService(),
      promptTemplateStub({
        renderSynthesisPrompt: jest.fn(),
      }),
      {
        load: jest.fn().mockResolvedValue(runtimeContext),
      } as unknown as AssistantOrchestratorRuntimeContextService,
    );

    await expect(service.run(input)).resolves.toEqual({
      context:
        "LLM planning output was invalid and fallback response was used.",
      fallback_reason: "planning_parse_failed",
      memory_writes: [],
      message:
        "Could not parse the model response correctly. Try selecting a different LLM model in settings.",
      tool_observations: [],
    });
  });

  it("records unknown_tool_name fallback metric for unsupported tool outputs", async () => {
    const metricsService = new AssistantOrchestratorMetricsService();
    const service = new AssistantRuntimeService(
      providerStub([
        {
          message: "",
          tool_arguments: {},
          tool_name: "mem_fact_search",
          type: "tool_call",
        },
      ]),
      {
        execute: jest.fn(),
      } as unknown as AssistantToolDispatcherService,
      metricsService,
      promptTemplateStub({
        renderSynthesisPrompt: jest.fn(),
      }),
      {
        load: jest.fn().mockResolvedValue(runtimeContext),
      } as unknown as AssistantOrchestratorRuntimeContextService,
    );

    await service.run(input);
    await expect(metricsService.render()).resolves.toContain(
      'runtime_fallback_total{reason="unknown_tool_name",service="assistant-orchestrator"} 1',
    );
  });

  it("summarizes conversation in separate call", async () => {
    const summarizeConversation = jest
      .fn()
      .mockResolvedValue("updated summary");
    const service = new AssistantRuntimeService(
      {
        generateFromMessages: jest.fn().mockResolvedValue({
          message: "unused",
          type: "final",
        }),
        summarizeConversation,
      } as unknown as AssistantLlmProvider,
      {
        execute: jest.fn(),
      } as unknown as AssistantToolDispatcherService,
      new AssistantOrchestratorMetricsService(),
      promptTemplateStub(),
      {
        load: jest.fn().mockResolvedValue(runtimeContext),
      } as unknown as AssistantOrchestratorRuntimeContextService,
    );

    await expect(
      service.summarizeConversation(input, "Assistant reply"),
    ).resolves.toBe("updated summary");
    expect(summarizeConversation).toHaveBeenCalledTimes(1);
  });
});
