import { Inject, Injectable, Logger } from "@nestjs/common";
import type {
  AssistantLlmConversationRespondResponse,
  AssistantLlmGenerateInput,
  AssistantLlmMessage,
  AssistantLlmProvider,
} from "./assistant-llm-provider";
import { ASSISTANT_LLM_PROVIDER } from "./assistant-llm-provider";
import type {
  AssistantLlmGenerateResult,
  AssistantLlmPlanResult,
} from "./assistant-llm-output-schema";
import {
  type AssistantToolName,
  SUPPORTED_ASSISTANT_TOOL_NAMES,
} from "./assistant-tool-catalog.service";
import { AssistantToolDispatcherService } from "./assistant-tool-dispatcher.service";
import { AssistantOrchestratorPromptTemplateService } from "./assistant-orchestrator-prompt-template.service";
import {
  type AssistantOrchestratorRuntimeContext,
  AssistantOrchestratorRuntimeContextService,
} from "./assistant-orchestrator-runtime-context.service";
import { AssistantRuntimeError } from "./assistant-runtime-error";
import { AssistantOrchestratorMetricsService } from "../observability/assistant-orchestrator-metrics.service";
import type { AssistantConversationMessage } from "./assistant-orchestrator-conversation.service";

@Injectable()
export class AssistantRuntimeService {
  private readonly logger = new Logger(AssistantRuntimeService.name);
  private static readonly MAX_DISABLED_TOOL_RETRIES = 1;

  constructor(
    @Inject(ASSISTANT_LLM_PROVIDER)
    private readonly llmProvider: AssistantLlmProvider,
    private readonly assistantToolDispatcherService: AssistantToolDispatcherService,
    private readonly metricsService: AssistantOrchestratorMetricsService,
    private readonly promptTemplateService: AssistantOrchestratorPromptTemplateService,
    private readonly runtimeContextService: AssistantOrchestratorRuntimeContextService,
  ) {}

  async run(
    input: AssistantLlmGenerateInput,
    enabledTools?: AssistantToolName[],
  ): Promise<AssistantLlmGenerateResult> {
    const runtimeContext = await this.runtimeContextService.load();

    try {
      this.metricsService.recordRuntimePhase("planning", true);
      this.logger.log(
        `Planning started conversationId=${input.message.conversation_id} retrievedMemory=${String(
          input.retrieved_memory.length,
        )}`,
      );
      const plan = await this.planWithDisabledToolRetry(
        input,
        runtimeContext,
        enabledTools,
      );
      this.logger.log(
        `Planning finished conversationId=${input.message.conversation_id} hasFinal=${String(Boolean(plan.final))} hasToolCall=${String(Boolean(plan.tool_call))}`,
      );

      if (plan.final) {
        return {
          ...plan.final,
          memory_writes: plan.final.memory_writes ?? [],
          tool_observations: plan.final.tool_observations ?? [],
        };
      }

      if (!plan.tool_call) {
        throw new AssistantRuntimeError(
          "PROVIDER_ERROR",
          "Planning step returned neither final answer nor tool call",
        );
      }

      const observation = await this.assistantToolDispatcherService.execute(
        {
          arguments: plan.tool_call.arguments,
          name: plan.tool_call.name as AssistantToolName,
        },
        input.message.conversation_id,
        enabledTools,
      );
      this.metricsService.recordToolInvocation(
        observation.tool_name,
        observation.ok,
      );
      this.metricsService.recordRuntimePhase("tool_execution", observation.ok);
      this.logger.log(
        `Tool execution conversationId=${input.message.conversation_id} tool=${observation.tool_name} ok=${String(observation.ok)}`,
      );

      const synthesisPrompt = await this.promptTemplateService.renderSynthesisPrompt(
        input,
        runtimeContext,
        observation,
        enabledTools,
      );
      const synthesisMessages = this.buildMessagesForPrompt(
        input,
        synthesisPrompt,
        true,
      );
      const synthesisAvailableTools =
        this.promptTemplateService.listAvailableTools(enabledTools);

      const synthesisStartedAt = Date.now();
      let synthesisPayload: AssistantLlmConversationRespondResponse;
      try {
        synthesisPayload = await this.llmProvider.generateFromMessages(
          synthesisMessages,
          synthesisAvailableTools,
        );
        this.metricsService.recordLlmMainRequest(true, "synthesis");
        this.metricsService.recordLlmMainDurationMs(
          Date.now() - synthesisStartedAt,
          "synthesis",
          true,
        );
      } catch (error) {
        this.metricsService.recordLlmMainRequest(false, "synthesis");
        this.metricsService.recordLlmMainDurationMs(
          Date.now() - synthesisStartedAt,
          "synthesis",
          false,
        );
        throw error;
      }

      const result = this.mapSynthesisResponse(
        synthesisPayload,
        input.message.message,
      );
      this.metricsService.recordRuntimePhase("synthesis", true);
      this.logger.log(
        `Synthesis finished conversationId=${input.message.conversation_id} messageLength=${String(
          result.message.length,
        )}`,
      );

      return {
        ...result,
        memory_writes: result.memory_writes ?? [],
        tool_observations: [
          ...(result.tool_observations ?? []),
          observation as unknown as Record<string, unknown>,
        ],
      };
    } catch (error) {
      const runtimeError =
        error instanceof AssistantRuntimeError
          ? error
          : new AssistantRuntimeError(
              "PROVIDER_ERROR",
              "Assistant runtime failed",
              error,
            );
      this.metricsService.recordRuntimePhase("failed", false);
      this.logger.error(
        `Assistant runtime failed conversationId=${input.message.conversation_id}: ${
          runtimeError.cause instanceof Error
            ? runtimeError.cause.message
            : runtimeError.message
        }`,
      );
      throw runtimeError;
    }
  }

  private async planWithDisabledToolRetry(
    input: AssistantLlmGenerateInput,
    runtimeContext: AssistantOrchestratorRuntimeContext,
    enabledTools?: AssistantToolName[],
  ): Promise<AssistantLlmPlanResult> {
    let disabledToolName: AssistantToolName | null = null;

    for (
      let attempt = 0;
      attempt <= AssistantRuntimeService.MAX_DISABLED_TOOL_RETRIES;
      attempt += 1
    ) {
      const plan = await this.invokePlanningChain(
        input,
        runtimeContext,
        enabledTools,
        disabledToolName,
      );

      if (
        plan.tool_call &&
        enabledTools &&
        !enabledTools.includes(plan.tool_call.name as AssistantToolName)
      ) {
        disabledToolName = plan.tool_call.name as AssistantToolName;
        this.logger.warn(
          `Planning selected disabled tool conversationId=${input.message.conversation_id} tool=${disabledToolName} attempt=${String(
            attempt + 1,
          )}`,
        );

        if (attempt < AssistantRuntimeService.MAX_DISABLED_TOOL_RETRIES) {
          continue;
        }

        throw new AssistantRuntimeError(
          "TOOL_ERROR",
          `Tool is disabled in assistant-orchestrator settings: ${disabledToolName}`,
        );
      }

      return plan;
    }

    throw new AssistantRuntimeError(
      "TOOL_ERROR",
      "Planning could not choose an enabled tool",
    );
  }

  private async invokePlanningChain(
    input: AssistantLlmGenerateInput,
    runtimeContext: AssistantOrchestratorRuntimeContext,
    enabledTools?: AssistantToolName[],
    disabledToolName?: AssistantToolName | null,
  ): Promise<AssistantLlmPlanResult> {
    const basePrompt = await this.promptTemplateService.renderPlanningPrompt(
      input,
      runtimeContext,
      enabledTools,
    );
    const planningPrompt = !disabledToolName
      ? basePrompt
      : [
          basePrompt,
          "",
          `Disabled tool feedback: the tool "${disabledToolName}" is disabled in assistant-orchestrator settings.`,
          `Choose only from enabled tools: ${enabledTools?.join(", ") ?? "none"}.`,
          "Do not return the disabled tool again.",
        ].join("\n");

    const planningMessages = this.buildMessagesForPrompt(input, planningPrompt, true);
    const planningAvailableTools =
      this.promptTemplateService.listAvailableTools(enabledTools);

    const startedAt = Date.now();
    let responsePayload: AssistantLlmConversationRespondResponse;
    try {
      responsePayload = await this.llmProvider.generateFromMessages(
        planningMessages,
        planningAvailableTools,
      );
      this.metricsService.recordLlmMainRequest(true, "planning");
      this.metricsService.recordLlmMainDurationMs(
        Date.now() - startedAt,
        "planning",
        true,
      );
    } catch (error) {
      this.metricsService.recordLlmMainRequest(false, "planning");
      this.metricsService.recordLlmMainDurationMs(
        Date.now() - startedAt,
        "planning",
        false,
      );
      throw error;
    }

    return this.mapPlanningResponse(responsePayload, input.message.message);
  }

  private mapPlanningResponse(
    payload: AssistantLlmConversationRespondResponse,
    userMessage: string,
  ): AssistantLlmPlanResult {
    if (payload.type === "tool_call") {
      const name = payload.tool_name?.trim();
      if (!name) {
        this.metricsService.recordRuntimeFallback("planning_parse_failed");
        return { final: this.buildPlanningFallbackResult(userMessage), tool_call: null };
      }
      if (!(SUPPORTED_ASSISTANT_TOOL_NAMES as readonly string[]).includes(name)) {
        this.metricsService.recordRuntimeFallback("unknown_tool_name");
        this.metricsService.recordRuntimeFallback("planning_parse_failed");
        return { final: this.buildPlanningFallbackResult(userMessage), tool_call: null };
      }
      return {
        final: undefined,
        tool_call: {
          arguments: payload.tool_arguments ?? {},
          name,
        },
      };
    }

    if (
      (payload.type === "final" || payload.type === "error") &&
      typeof payload.message === "string" &&
      payload.message.trim().length > 0
    ) {
      return {
        final: {
          context: payload.context?.trim() ?? "",
          memory_writes: payload.memory_writes ?? [],
          message: payload.message.trim(),
          tool_observations: payload.tool_observations ?? [],
        },
        tool_call: null,
      };
    }

    this.metricsService.recordRuntimeFallback("planning_parse_failed");
    return {
      final: this.buildPlanningFallbackResult(userMessage),
      tool_call: null,
    };
  }

  private mapSynthesisResponse(
    payload: AssistantLlmConversationRespondResponse,
    userMessage: string,
  ): AssistantLlmGenerateResult {
    if (
      (payload.type === "final" || payload.type === "error") &&
      typeof payload.message === "string" &&
      payload.message.trim().length > 0
    ) {
      return {
        context: payload.context?.trim() ?? "",
        memory_writes: payload.memory_writes ?? [],
        message: payload.message.trim(),
        tool_observations: payload.tool_observations ?? [],
      };
    }

    this.metricsService.recordRuntimeFallback("synthesis_parse_failed");
    return {
      context: "",
      fallback_reason: "synthesis_parse_failed",
      memory_writes: [],
      message: /[А-Яа-яЁё]/.test(userMessage)
        ? "Не удалось корректно обработать ответ модели. Попробуйте выбрать другую LLM модель в настройках."
        : "Could not parse the model response correctly. Try selecting a different LLM model in settings.",
      tool_observations: [],
    };
  }

  private buildPlanningFallbackResult(userMessage: string): AssistantLlmGenerateResult {
    const isRussian = /[А-Яа-яЁё]/.test(userMessage);

    return {
      context: "LLM planning output was invalid and fallback response was used.",
      fallback_reason: "planning_parse_failed",
      memory_writes: [],
      message: isRussian
        ? "Не удалось корректно обработать ответ модели. Попробуйте выбрать другую LLM модель в настройках."
        : "Could not parse the model response correctly. Try selecting a different LLM model in settings.",
      tool_observations: [],
    };
  }

  private buildMessagesForPrompt(
    input: AssistantLlmGenerateInput,
    prompt: string,
    includeCurrentUserMessage: boolean,
  ): AssistantLlmMessage[] {
    return [
      {
        content: prompt,
        role: "system",
      },
      ...this.buildHistoryMessages(input.conversation.messages),
      ...(includeCurrentUserMessage
        ? [{ content: input.message.message, role: "user" as const }]
        : []),
    ];
  }

  private buildSummaryMessages(
    input: AssistantLlmGenerateInput,
    assistantMessage: string,
  ): AssistantLlmMessage[] {
    return [
      ...this.buildHistoryMessages(input.conversation.messages),
      { content: input.message.message, role: "user" },
      { content: assistantMessage, role: "assistant" },
    ];
  }

  private buildHistoryMessages(messages: AssistantConversationMessage[]): AssistantLlmMessage[] {
    return messages.map((message) => ({
      content: message.content,
      role: message.role,
    }));
  }
}
