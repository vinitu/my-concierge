import {
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type {
  AssistantLlmGenerateInput,
  AssistantLlmMessage,
  AssistantLlmProvider,
} from './assistant-llm-provider';
import { ASSISTANT_LLM_PROVIDER } from './assistant-llm-provider';
import {
  type AssistantLlmGenerateResult,
  assistantPlanningOutputParser,
  assistantSynthesisOutputParser,
} from './assistant-llm-output-schema';
import { AssistantToolDispatcherService } from './assistant-tool-dispatcher.service';
import { AssistantOrchestratorPromptTemplateService } from './assistant-orchestrator-prompt-template.service';
import {
  type AssistantOrchestratorRuntimeContext,
  AssistantOrchestratorRuntimeContextService,
} from './assistant-orchestrator-runtime-context.service';
import { AssistantRuntimeError } from './assistant-runtime-error';
import { AssistantOrchestratorMetricsService } from '../observability/assistant-orchestrator-metrics.service';
import type { AssistantToolName } from './assistant-tool-catalog.service';
import type { AssistantConversationMessage } from './assistant-orchestrator-conversation.service';

@Injectable()
export class AssistantRuntimeService {
  private readonly logger = new Logger(AssistantRuntimeService.name);
  private static readonly MAX_DISABLED_TOOL_RETRIES = 1;
  private static readonly MAX_PARSE_REPAIR_ATTEMPTS = 1;

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
      this.metricsService.recordRuntimePhase('planning', true);
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
          'PROVIDER_ERROR',
          'Planning step returned neither final answer nor tool call',
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
      this.metricsService.recordToolInvocation(observation.tool_name, observation.ok);
      this.metricsService.recordRuntimePhase('tool_execution', observation.ok);
      this.logger.log(
        `Tool execution conversationId=${input.message.conversation_id} tool=${observation.tool_name} ok=${String(observation.ok)}`,
      );

      const synthesisPrompt = await this.promptTemplateService.renderSynthesisPrompt(
        input,
        runtimeContext,
        observation,
        enabledTools,
      );
      const synthesisMessages = this.buildMessagesForPrompt(input, synthesisPrompt, true);
      const synthesisStartedAt = Date.now();
      let synthesisResponse: string;
      try {
        synthesisResponse = await this.llmProvider.generateFromMessages(synthesisMessages);
        this.metricsService.recordLlmMainRequest(true, 'synthesis');
        this.metricsService.recordLlmMainDurationMs(
          Date.now() - synthesisStartedAt,
          'synthesis',
          true,
        );
      } catch (error) {
        this.metricsService.recordLlmMainRequest(false, 'synthesis');
        this.metricsService.recordLlmMainDurationMs(
          Date.now() - synthesisStartedAt,
          'synthesis',
          false,
        );
        throw error;
      }
      const result = await this.parseSynthesisWithRecovery(
        synthesisResponse,
        input.message.conversation_id,
        input.message.message,
      );
      this.metricsService.recordRuntimePhase('synthesis', true);
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
          : new AssistantRuntimeError('PROVIDER_ERROR', 'Assistant runtime failed', error);
      this.metricsService.recordRuntimePhase('failed', false);
      this.logger.error(
        `Assistant runtime failed conversationId=${input.message.conversation_id}: ${
          runtimeError.cause instanceof Error ? runtimeError.cause.message : runtimeError.message
        }`,
      );
      throw runtimeError;
    }
  }

  async summarizeConversation(
    input: AssistantLlmGenerateInput,
    assistantMessage: string,
  ): Promise<string> {
    const messages = this.buildSummaryMessages(input, assistantMessage);
    const startedAt = Date.now();

    try {
      const summary = await this.llmProvider.summarizeConversation(
        messages,
        input.conversation.context,
      );
      this.metricsService.recordLlmSummaryRequest(true);
      this.metricsService.recordLlmSummaryDurationMs(Date.now() - startedAt, true);
      return summary.trim() || input.conversation.context;
    } catch (error) {
      this.metricsService.recordLlmSummaryRequest(false);
      this.metricsService.recordLlmSummaryDurationMs(Date.now() - startedAt, false);
      throw error;
    }
  }

  private async planWithDisabledToolRetry(
    input: AssistantLlmGenerateInput,
    runtimeContext: AssistantOrchestratorRuntimeContext,
    enabledTools?: AssistantToolName[],
  ): Promise<Awaited<ReturnType<typeof assistantPlanningOutputParser.parse>>> {
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
          'TOOL_ERROR',
          `Tool is disabled in assistant-orchestrator settings: ${disabledToolName}`,
        );
      }

      return plan;
    }

    throw new AssistantRuntimeError(
      'TOOL_ERROR',
      'Planning could not choose an enabled tool',
    );
  }

  private async invokePlanningChain(
    input: AssistantLlmGenerateInput,
    runtimeContext: AssistantOrchestratorRuntimeContext,
    enabledTools?: AssistantToolName[],
    disabledToolName?: AssistantToolName | null,
  ): Promise<Awaited<ReturnType<typeof assistantPlanningOutputParser.parse>>> {
    const basePrompt = await this.promptTemplateService.renderPlanningPrompt(
      input,
      runtimeContext,
      enabledTools,
    );
    const planningPrompt = !disabledToolName
      ? basePrompt
      : [
          basePrompt,
          '',
          `Disabled tool feedback: the tool "${disabledToolName}" is disabled in assistant-orchestrator settings.`,
          `Choose only from enabled tools: ${enabledTools?.join(', ') ?? 'none'}.`,
          'Do not return the disabled tool again.',
        ].join('\n');

    const planningMessages = this.buildMessagesForPrompt(input, planningPrompt, true);
    const startedAt = Date.now();
    let responseText: string;
    try {
      responseText = await this.llmProvider.generateFromMessages(planningMessages);
      this.metricsService.recordLlmMainRequest(true, 'planning');
      this.metricsService.recordLlmMainDurationMs(Date.now() - startedAt, 'planning', true);
    } catch (error) {
      this.metricsService.recordLlmMainRequest(false, 'planning');
      this.metricsService.recordLlmMainDurationMs(Date.now() - startedAt, 'planning', false);
      throw error;
    }

    return this.parsePlanningWithRecovery(
      responseText,
      input.message.conversation_id,
      input.message.message,
    );
  }

  private async parsePlanningWithRecovery(
    responseText: string,
    conversationId: string,
    userMessage: string,
  ): Promise<Awaited<ReturnType<typeof assistantPlanningOutputParser.parse>>> {
    return this.parseWithRecovery(
      'planning',
      responseText,
      assistantPlanningOutputParser.parse.bind(assistantPlanningOutputParser),
      conversationId,
      userMessage,
    );
  }

  private async parseSynthesisWithRecovery(
    responseText: string,
    conversationId: string,
    userMessage: string,
  ): Promise<AssistantLlmGenerateResult> {
    return this.parseWithRecovery(
      'synthesis',
      responseText,
      assistantSynthesisOutputParser.parse.bind(assistantSynthesisOutputParser),
      conversationId,
      userMessage,
    );
  }

  private async parseWithRecovery<T>(
    phase: 'planning' | 'synthesis',
    responseText: string,
    parser: (text: string) => Promise<T>,
    conversationId: string,
    userMessage: string,
  ): Promise<T> {
    const normalizedCandidates = this.buildParseCandidates(responseText, phase);
    let lastError: unknown = null;
    let unknownToolNameDetected = false;

    for (const candidate of normalizedCandidates) {
      try {
        return await parser(candidate);
      } catch (error) {
        lastError = error;
        unknownToolNameDetected ||= this.isUnknownToolNameError(error);
      }
    }

    if (phase === 'planning') {
      const plainTextPlanning = this.extractPlainTextPlanningFinal(responseText);
      if (plainTextPlanning) {
        this.logger.warn(
          `planning plain-text fallback used conversationId=${conversationId}; converting raw model text into final`,
        );
        this.metricsService.recordRuntimeFallback('planning_plain_text');
        return parser(this.buildPlanningPlainTextFallbackResult(plainTextPlanning));
      }
    }

    for (
      let attempt = 1;
      attempt <= AssistantRuntimeService.MAX_PARSE_REPAIR_ATTEMPTS;
      attempt += 1
    ) {
      this.logger.warn(
        `${phase} parse failed conversationId=${conversationId} attempt=${String(
          attempt,
        )}; requesting repair`,
      );
      const repairPrompt = this.buildParseRepairPrompt(phase, responseText);
      const repairMessages: AssistantLlmMessage[] = [{ content: repairPrompt, role: 'system' }];
      const repairedResponse = await this.llmProvider.generateFromMessages(repairMessages);
      const repairedCandidates = this.buildParseCandidates(repairedResponse, phase);

      for (const candidate of repairedCandidates) {
        try {
          return await parser(candidate);
        } catch (error) {
          lastError = error;
          unknownToolNameDetected ||= this.isUnknownToolNameError(error);
        }
      }
    }

    if (phase === 'planning') {
      if (unknownToolNameDetected) {
        this.metricsService.recordRuntimeFallback('unknown_tool_name');
      }
      const fallback = this.buildPlanningFallbackResult(userMessage);
      this.logger.warn(
        `planning parse fallback used conversationId=${conversationId}; returning deterministic final`,
      );
      this.metricsService.recordRuntimeFallback('planning_parse_failed');
      return parser(fallback);
    }

    throw lastError instanceof Error ? lastError : new Error('Structured output parsing failed');
  }

  private buildParseRepairPrompt(
    phase: 'planning' | 'synthesis',
    invalidOutput: string,
  ): string {
    const shapeInstructions =
      phase === 'planning'
        ? [
            'Return exactly ONE JSON object in this form:',
            '{"type":"final|tool_call|error","message":"...","tool_name":"optional","tool_arguments":{},"context":"...","memory_writes":[],"tool_observations":[]}',
            'Allowed tool names:',
            '["memory_conversation_search","memory_search","memory_preference_search","memory_fact_search","memory_routine_search","memory_project_search","memory_episode_search","memory_rule_search","memory_preference_write","memory_fact_write","memory_routine_write","memory_project_write","memory_episode_write","memory_rule_write","skill_execute","time_current","web_search"]',
            'If type=tool_call, set tool_name and tool_arguments.',
            'If type=final or type=error, message must be non-empty.',
            'Do not include any other top-level fields beyond the schema.',
          ]
        : [
            'Return exactly ONE JSON object with this shape:',
            '{"message":"...","context":"...","memory_writes":[],"tool_observations":[]}',
            'Do not include any other top-level fields.',
          ];
    const truncatedInvalidOutput =
      invalidOutput.length > 4000
        ? `${invalidOutput.slice(0, 4000)}\n...[truncated]`
        : invalidOutput;

    return [
      `You are a strict JSON output repair helper for assistant ${phase} phase.`,
      'Return ONLY one valid JSON object and nothing else.',
      'Do not use markdown fences.',
      'Do not add explanations.',
      '',
      ...shapeInstructions,
      '',
      'Original model output to repair:',
      truncatedInvalidOutput,
    ].join('\n');
  }

  private buildParseCandidates(
    responseText: string,
    phase: 'planning' | 'synthesis',
  ): string[] {
    const trimmed = responseText.trim();
    const unwrappedFence = this.unwrapJsonFence(trimmed);
    const extractedJsonObject = this.extractFirstJsonObject(unwrappedFence);
    const normalized = this.normalizeCandidateForPhase(extractedJsonObject, phase);
    const candidates = [trimmed, unwrappedFence, extractedJsonObject, normalized].filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
    return [...new Set(candidates)];
  }

  private normalizeCandidateForPhase(
    candidate: string,
    phase: 'planning' | 'synthesis',
  ): string | null {
    if (phase !== 'planning') {
      return null;
    }

    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }

      const normalizedParsed = { ...parsed } as Record<string, unknown>;

      // Backward compatibility with legacy planning shapes.
      const legacyFinal = normalizedParsed.final;
      if (legacyFinal && typeof legacyFinal === 'object' && !Array.isArray(legacyFinal)) {
        const value = legacyFinal as Record<string, unknown>;
        normalizedParsed.type = 'final';
        normalizedParsed.message =
          (typeof value.message === 'string' && value.message) ||
          (typeof value.response === 'string' && value.response) ||
          (typeof value.reply === 'string' && value.reply) ||
          (typeof value.answer === 'string' && value.answer) ||
          (typeof value.text === 'string' && value.text) ||
          (typeof value.content === 'string' && value.content) ||
          '';
        normalizedParsed.context =
          typeof value.context === 'string' ? value.context : '';
        normalizedParsed.memory_writes = Array.isArray(value.memory_writes)
          ? value.memory_writes
          : [];
        normalizedParsed.tool_observations = Array.isArray(value.tool_observations)
          ? value.tool_observations
          : [];
        delete normalizedParsed.final;
      }

      const legacyToolCall = normalizedParsed.tool_call;
      if (
        legacyToolCall &&
        typeof legacyToolCall === 'object' &&
        !Array.isArray(legacyToolCall)
      ) {
        const value = legacyToolCall as Record<string, unknown>;
        normalizedParsed.type = 'tool_call';
        normalizedParsed.tool_name =
          typeof value.name === 'string' ? value.name : '';
        normalizedParsed.tool_arguments =
          value.arguments && typeof value.arguments === 'object' && !Array.isArray(value.arguments)
            ? value.arguments
            : {};
        delete normalizedParsed.tool_call;
      }

      if (!('type' in normalizedParsed)) {
        normalizedParsed.type = 'final';
      }

      const rawToolName = normalizedParsed.tool_name;
      if (typeof rawToolName === 'string' && rawToolName.includes('|')) {
        const firstTool = rawToolName
          .split('|')
          .map((value) => value.trim())
          .find((value) => value.length > 0);
        if (firstTool) {
          normalizedParsed.tool_name = firstTool;
        }
      }

      const rawArguments = normalizedParsed.tool_arguments;
      if (
        typeof rawArguments !== 'object' ||
        rawArguments === null ||
        Array.isArray(rawArguments)
      ) {
        normalizedParsed.tool_arguments = {};
      }

      return JSON.stringify(normalizedParsed);
    } catch {
      return null;
    }
  }

  private buildPlanningFallbackResult(userMessage: string): string {
    const isRussian = /[А-Яа-яЁё]/.test(userMessage);

    return JSON.stringify({
      context: 'LLM planning output was invalid and fallback response was used.',
      fallback_reason: 'planning_parse_failed',
      memory_writes: [],
      message: isRussian
        ? 'Не удалось корректно обработать ответ модели. Попробуйте выбрать другую LLM модель в настройках.'
        : 'Could not parse the model response correctly. Try selecting a different LLM model in settings.',
      tool_observations: [],
      type: 'final',
    });
  }

  private buildPlanningPlainTextFallbackResult(message: string): string {
    return JSON.stringify({
      context: '',
      fallback_reason: 'planning_plain_text',
      memory_writes: [],
      message,
      tool_observations: [],
      type: 'final',
    });
  }

  private extractPlainTextPlanningFinal(responseText: string): string | null {
    const normalized = this.unwrapJsonFence(responseText).trim();

    if (!normalized) {
      return null;
    }

    if (normalized.startsWith('{') || normalized.startsWith('[')) {
      return null;
    }

    if (normalized.length > 280) {
      return null;
    }

    const lower = normalized.toLowerCase();
    const promptEchoMarkers = [
      'you are the planning phase',
      'allowed top-level shapes',
      'available_tools',
      'system_instructions',
      'tool_call',
      'memory_writes',
    ];

    if (promptEchoMarkers.some((marker) => lower.includes(marker))) {
      return null;
    }

    return normalized;
  }

  private buildMessagesForPrompt(
    input: AssistantLlmGenerateInput,
    prompt: string,
    includeCurrentUserMessage: boolean,
  ): AssistantLlmMessage[] {
    return [
      {
        content: prompt,
        role: 'system',
      },
      ...this.buildHistoryMessages(input.conversation.messages),
      ...(includeCurrentUserMessage
        ? [{ content: input.message.message, role: 'user' as const }]
        : []),
    ];
  }

  private buildSummaryMessages(
    input: AssistantLlmGenerateInput,
    assistantMessage: string,
  ): AssistantLlmMessage[] {
    return [
      ...this.buildHistoryMessages(input.conversation.messages),
      { content: input.message.message, role: 'user' },
      { content: assistantMessage, role: 'assistant' },
    ];
  }

  private buildHistoryMessages(messages: AssistantConversationMessage[]): AssistantLlmMessage[] {
    return messages.map((message) => ({
      content: message.content,
      role: message.role,
    }));
  }

  private unwrapJsonFence(responseText: string): string {
    const match = responseText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return match ? match[1].trim() : responseText;
  }

  private extractFirstJsonObject(responseText: string): string {
    const start = responseText.indexOf('{');

    if (start < 0) {
      return responseText;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < responseText.length; index += 1) {
      const char = responseText[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return responseText.slice(start, index + 1).trim();
        }
      }
    }

    return responseText;
  }

  private isUnknownToolNameError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message;
    return (
      message.includes('Invalid enum value') &&
      (message.includes('"tool_name"') || message.includes('tool_name'))
    );
  }
}
