import { AssistantOrchestratorMetricsService } from "../observability/assistant-orchestrator-metrics.service";
import { AssistantRuntimeService } from "./assistant-runtime.service";
import type { AssistantLlmProvider } from "./assistant-llm-provider";
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

  function providerStub(mainReplies: string[]): AssistantLlmProvider {
    const generateFromMessages = jest.fn();
    for (const reply of mainReplies) {
      generateFromMessages.mockResolvedValueOnce(reply);
    }

    return {
      generateFromMessages,
      summarizeConversation: jest.fn().mockResolvedValue("summary"),
    };
  }

  it("returns direct final result when planning chooses no tool", async () => {
    const service = new AssistantRuntimeService(
      providerStub([
        '{"final":{"message":"Dinner is at 19:00.","context":"Dinner is planned for 19:00.","memory_writes":[],"tool_observations":[]}}',
      ]),
      {
        execute: jest.fn(),
      } as unknown as AssistantToolDispatcherService,
      new AssistantOrchestratorMetricsService(),
      {
        renderPlanningPrompt: jest.fn().mockResolvedValue("planning prompt"),
        renderSynthesisPrompt: jest.fn(),
      } as unknown as AssistantOrchestratorPromptTemplateService,
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
        '{"tool_call":{"name":"time_current","arguments":{}}}',
        '{"message":"It is dinner time.","context":"Current dinner planning is active.","memory_writes":[],"tool_observations":[]}',
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
      {
        renderPlanningPrompt: jest.fn().mockResolvedValue("planning prompt"),
        renderSynthesisPrompt: jest.fn().mockResolvedValue("synthesis prompt"),
      } as unknown as AssistantOrchestratorPromptTemplateService,
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

  it("normalizes weak model tool_call output", async () => {
    const service = new AssistantRuntimeService(
      providerStub([
        '{"tool_call":{"name":"time_current|web_search|memory_conversation_search"}}',
        '{"message":"Done.","context":"Tool normalized.","memory_writes":[],"tool_observations":[]}',
      ]),
      {
        execute: jest.fn().mockResolvedValue({
          ok: true,
          result: { iso: "2026-03-27T10:00:00.000Z" },
          tool_name: "time_current",
        }),
      } as unknown as AssistantToolDispatcherService,
      new AssistantOrchestratorMetricsService(),
      {
        renderPlanningPrompt: jest.fn().mockResolvedValue("planning prompt"),
        renderSynthesisPrompt: jest.fn().mockResolvedValue("synthesis prompt"),
      } as unknown as AssistantOrchestratorPromptTemplateService,
      {
        load: jest.fn().mockResolvedValue(runtimeContext),
      } as unknown as AssistantOrchestratorRuntimeContextService,
    );

    await expect(service.run(input)).resolves.toEqual({
      context: "Tool normalized.",
      memory_writes: [],
      message: "Done.",
      tool_observations: [
        {
          ok: true,
          result: { iso: "2026-03-27T10:00:00.000Z" },
          tool_name: "time_current",
        },
      ],
    });
  });

  it("returns user-friendly fallback when planning cannot be repaired", async () => {
    const service = new AssistantRuntimeService(
      providerStub([
        '{"current_user_message":{"message":"привет"},"available_tools":[{"name":"time_current"}]}',
        '{"still":"invalid"}',
      ]),
      {
        execute: jest.fn(),
      } as unknown as AssistantToolDispatcherService,
      new AssistantOrchestratorMetricsService(),
      {
        renderPlanningPrompt: jest.fn().mockResolvedValue("planning prompt"),
        renderSynthesisPrompt: jest.fn(),
      } as unknown as AssistantOrchestratorPromptTemplateService,
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

  it("records unknown_tool_name fallback metric for legacy mem_* tool outputs", async () => {
    const metricsService = new AssistantOrchestratorMetricsService();
    const service = new AssistantRuntimeService(
      providerStub([
        '{"type":"tool_call","tool_name":"mem_fact_search","tool_arguments":{}}',
        '{"still":"invalid"}',
      ]),
      {
        execute: jest.fn(),
      } as unknown as AssistantToolDispatcherService,
      metricsService,
      {
        renderPlanningPrompt: jest.fn().mockResolvedValue("planning prompt"),
        renderSynthesisPrompt: jest.fn(),
      } as unknown as AssistantOrchestratorPromptTemplateService,
      {
        load: jest.fn().mockResolvedValue(runtimeContext),
      } as unknown as AssistantOrchestratorRuntimeContextService,
    );

    await service.run(input);
    await expect(metricsService.render()).resolves.toContain(
      'runtime_fallback_total{reason="unknown_tool_name",service="assistant-orchestrator"} 1',
    );
  });

  it("converts plain text planning response into final message fallback", async () => {
    const service = new AssistantRuntimeService(
      providerStub(["Привет!"]),
      {
        execute: jest.fn(),
      } as unknown as AssistantToolDispatcherService,
      new AssistantOrchestratorMetricsService(),
      {
        renderPlanningPrompt: jest.fn().mockResolvedValue("planning prompt"),
        renderSynthesisPrompt: jest.fn(),
      } as unknown as AssistantOrchestratorPromptTemplateService,
      {
        load: jest.fn().mockResolvedValue(runtimeContext),
      } as unknown as AssistantOrchestratorRuntimeContextService,
    );

    await expect(service.run(input)).resolves.toEqual({
      context: "",
      fallback_reason: "planning_plain_text",
      memory_writes: [],
      message: "Привет!",
      tool_observations: [],
    });
  });

  it("summarizes conversation in separate call", async () => {
    const summarizeConversation = jest
      .fn()
      .mockResolvedValue("updated summary");
    const service = new AssistantRuntimeService(
      {
        generateFromMessages: jest.fn().mockResolvedValue("{}"),
        summarizeConversation,
      } as unknown as AssistantLlmProvider,
      {
        execute: jest.fn(),
      } as unknown as AssistantToolDispatcherService,
      new AssistantOrchestratorMetricsService(),
      {
        renderPlanningPrompt: jest.fn().mockResolvedValue("planning prompt"),
        renderSynthesisPrompt: jest.fn().mockResolvedValue("synthesis prompt"),
      } as unknown as AssistantOrchestratorPromptTemplateService,
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
