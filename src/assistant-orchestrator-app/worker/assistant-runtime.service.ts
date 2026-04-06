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
  private static readonly MAX_REPEATED_TOOL_RETRIES = 1;

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
    maxToolSteps = 4,
  ): Promise<AssistantLlmGenerateResult> {
    const runtimeContext = await this.runtimeContextService.load();
    const observations: Array<Record<string, unknown>> = [];

    try {
      for (let stepIndex = 0; stepIndex <= maxToolSteps; stepIndex += 1) {
        const phase = stepIndex === 0 ? "planning" : "agent_loop";
        this.metricsService.recordRuntimePhase(phase, true);
        this.logger.log(
          `Agent loop step started conversationId=${input.message.conversation_id} step=${String(
            stepIndex + 1,
          )} toolObservations=${String(observations.length)} retrievedMemory=${String(
            input.retrieved_memory.length,
          )}`,
        );
        const plan = await this.planWithToolRetry(
          input,
          runtimeContext,
          enabledTools,
          observations,
          phase,
        );
        this.logger.log(
          `Agent loop step finished conversationId=${input.message.conversation_id} step=${String(
            stepIndex + 1,
          )} hasFinal=${String(Boolean(plan.final))} hasToolCall=${String(Boolean(plan.tool_call))}`,
        );

        if (plan.final) {
          return {
            ...plan.final,
            memory_writes: plan.final.memory_writes ?? [],
            tool_observations: observations,
          };
        }

        if (!plan.tool_call) {
          throw new AssistantRuntimeError(
            "PROVIDER_ERROR",
            "Agent loop step returned neither final answer nor tool call",
          );
        }

        if (stepIndex >= maxToolSteps) {
          throw new AssistantRuntimeError(
            "TOOL_ERROR",
            `Assistant exceeded max_tool_steps=${String(maxToolSteps)}`,
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
          `Tool execution conversationId=${input.message.conversation_id} step=${String(
            stepIndex + 1,
          )} tool=${observation.tool_name} ok=${String(observation.ok)}`,
        );
        observations.push(observation as unknown as Record<string, unknown>);
      }

      throw new AssistantRuntimeError(
        "TOOL_ERROR",
        `Assistant exceeded max_tool_steps=${String(maxToolSteps)}`,
      );
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

  private async planWithToolRetry(
    input: AssistantLlmGenerateInput,
    runtimeContext: AssistantOrchestratorRuntimeContext,
    enabledTools?: AssistantToolName[],
    toolObservations?: Array<Record<string, unknown>>,
    phase = "planning",
  ): Promise<AssistantLlmPlanResult> {
    let disabledToolName: AssistantToolName | null = null;
    let repeatedToolCall:
      | {
          arguments: Record<string, unknown>;
          name: AssistantToolName;
        }
      | null = null;

    for (
      let attempt = 0;
      attempt <=
      AssistantRuntimeService.MAX_DISABLED_TOOL_RETRIES +
        AssistantRuntimeService.MAX_REPEATED_TOOL_RETRIES;
      attempt += 1
    ) {
      const plan = await this.invokePlanningChain(
        input,
        runtimeContext,
        enabledTools,
        disabledToolName,
        repeatedToolCall,
        toolObservations,
        phase,
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

      if (plan.tool_call) {
        const repeatedToolObservation = this.findRepeatedToolObservation(
          plan.tool_call.name as AssistantToolName,
          plan.tool_call.arguments,
          toolObservations,
        );

        if (repeatedToolObservation) {
          this.logger.warn(
            `Planning repeated tool call conversationId=${input.message.conversation_id} tool=${plan.tool_call.name} attempt=${String(
              attempt + 1,
            )}`,
          );

          if (repeatedToolCall) {
            throw new AssistantRuntimeError(
              "TOOL_ERROR",
              `Model repeated tool call after successful observation: ${plan.tool_call.name}`,
            );
          }

          repeatedToolCall = {
            arguments: plan.tool_call.arguments,
            name: plan.tool_call.name as AssistantToolName,
          };
          disabledToolName = null;
          continue;
        }
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
    repeatedToolCall?:
      | {
          arguments: Record<string, unknown>;
          name: AssistantToolName;
        }
      | null,
    toolObservations?: Array<Record<string, unknown>>,
    phase = "planning",
  ): Promise<AssistantLlmPlanResult> {
    const basePrompt = await this.promptTemplateService.renderPlanningPrompt(
      input,
      runtimeContext,
      enabledTools,
      toolObservations as never,
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
    const planningPromptWithFeedback = !repeatedToolCall
      ? planningPrompt
      : [
          planningPrompt,
          "",
          `Repeated tool feedback: the tool "${repeatedToolCall.name}" with the same arguments was already executed successfully.`,
          `Repeated tool arguments: ${JSON.stringify(repeatedToolCall.arguments)}.`,
          "Use the existing tool_observations to answer, or choose a different tool only if it is strictly necessary.",
          "Do not return the same tool call again.",
        ].join("\n");

    const planningMessages = this.buildMessagesForPrompt(
      input,
      planningPromptWithFeedback,
      true,
    );
    const planningAvailableTools =
      this.promptTemplateService.listAvailableTools(enabledTools);

    const startedAt = Date.now();
    let responsePayload: AssistantLlmConversationRespondResponse;
    try {
      responsePayload = await this.llmProvider.generateFromMessages(
        planningMessages,
        planningAvailableTools,
      );
      this.metricsService.recordLlmMainRequest(true, phase);
      this.metricsService.recordLlmMainDurationMs(
        Date.now() - startedAt,
        phase,
        true,
      );
    } catch (error) {
      this.metricsService.recordLlmMainRequest(false, phase);
      this.metricsService.recordLlmMainDurationMs(
        Date.now() - startedAt,
        phase,
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

  private findRepeatedToolObservation(
    toolName: AssistantToolName,
    toolArguments: Record<string, unknown>,
    toolObservations?: Array<Record<string, unknown>>,
  ): Record<string, unknown> | null {
    if (!Array.isArray(toolObservations)) {
      return null;
    }

    const serializedArguments = this.serializeToolArguments(toolArguments);
    for (const observation of toolObservations) {
      if (observation?.tool_name !== toolName || observation?.ok !== true) {
        continue;
      }

      const observationArguments =
        typeof observation.arguments === "object" && observation.arguments !== null
          ? (observation.arguments as Record<string, unknown>)
          : {};
      if (this.serializeToolArguments(observationArguments) === serializedArguments) {
        return observation;
      }
    }

    return null;
  }

  private serializeToolArguments(value: Record<string, unknown>): string {
    return JSON.stringify(this.sortUnknown(value));
  }

  private sortUnknown(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((entry) => this.sortUnknown(entry));
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, this.sortUnknown(nested)]),
      );
    }

    return value;
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
