import {
  Injectable,
  Logger,
} from '@nestjs/common';
import type {
  AssistantLlmGenerateInput,
  AssistantLlmProvider,
} from './assistant-llm-provider';
import { ASSISTANT_LLM_PROVIDER } from './assistant-llm-provider';
import {
  type AssistantLlmGenerateResult,
  assistantPlanningOutputParser,
  assistantSynthesisOutputParser,
} from './assistant-llm-output-schema';
import { AssistantToolDispatcherService } from './assistant-tool-dispatcher.service';
import { AssistantWorkerPromptTemplateService } from './assistant-worker-prompt-template.service';
import {
  type AssistantWorkerRuntimeContext,
  AssistantWorkerRuntimeContextService,
} from './assistant-worker-runtime-context.service';
import { Inject } from '@nestjs/common';
import { AssistantRuntimeError } from './assistant-runtime-error';
import { AssistantWorkerMetricsService } from '../observability/assistant-worker-metrics.service';
import type { AssistantToolName } from './assistant-tool-catalog.service';

@Injectable()
export class AssistantLangchainRuntimeService {
  private readonly logger = new Logger(AssistantLangchainRuntimeService.name);
  private static readonly MAX_DISABLED_TOOL_RETRIES = 1;
  private static readonly MAX_PARSE_REPAIR_ATTEMPTS = 1;

  constructor(
    @Inject(ASSISTANT_LLM_PROVIDER)
    private readonly llmProvider: AssistantLlmProvider,
    private readonly assistantToolDispatcherService: AssistantToolDispatcherService,
    private readonly metricsService: AssistantWorkerMetricsService,
    private readonly promptTemplateService: AssistantWorkerPromptTemplateService,
    private readonly runtimeContextService: AssistantWorkerRuntimeContextService,
  ) {}

  async run(
    input: AssistantLlmGenerateInput,
    enabledTools?: AssistantToolName[],
  ): Promise<AssistantLlmGenerateResult> {
    const runtimeContext = await this.runtimeContextService.load();

    try {
      this.metricsService.recordLangchainRun('planning', true);
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
      this.metricsService.recordLangchainRun('tool_execution', observation.ok);
      this.logger.log(
        `Tool execution conversationId=${input.message.conversation_id} tool=${observation.tool_name} ok=${String(observation.ok)}`,
      );

      const synthesisPrompt = await this.promptTemplateService.renderSynthesisPrompt(
        input,
        runtimeContext,
        observation,
        enabledTools,
      );
      const synthesisResponse = await this.llmProvider.generateText(synthesisPrompt);
      const result = await this.parseSynthesisWithRecovery(
        synthesisResponse,
        input.message.conversation_id,
      );
      this.metricsService.recordLangchainRun('synthesis', true);
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
          : new AssistantRuntimeError('PROVIDER_ERROR', 'LangChain runtime failed', error);
      this.metricsService.recordLangchainRun('failed', false);
      this.logger.error(
        `LangChain runtime failed conversationId=${input.message.conversation_id}: ${
          runtimeError.cause instanceof Error ? runtimeError.cause.message : runtimeError.message
        }`,
      );
      throw runtimeError;
    }
  }

  private async planWithDisabledToolRetry(
    input: AssistantLlmGenerateInput,
    runtimeContext: AssistantWorkerRuntimeContext,
    enabledTools?: AssistantToolName[],
  ): Promise<Awaited<ReturnType<typeof assistantPlanningOutputParser.parse>>> {
    let disabledToolName: AssistantToolName | null = null;

    for (
      let attempt = 0;
      attempt <= AssistantLangchainRuntimeService.MAX_DISABLED_TOOL_RETRIES;
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

        if (attempt < AssistantLangchainRuntimeService.MAX_DISABLED_TOOL_RETRIES) {
          continue;
        }

        throw new AssistantRuntimeError(
          'TOOL_ERROR',
          `Tool is disabled in assistant-worker settings: ${disabledToolName}`,
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
    runtimeContext: AssistantWorkerRuntimeContext,
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
          `Disabled tool feedback: the tool "${disabledToolName}" is disabled in assistant-worker settings.`,
          `Choose only from enabled tools: ${enabledTools?.join(', ') ?? 'none'}.`,
          'Do not return the disabled tool again.',
        ].join('\n');
    const responseText = await this.llmProvider.generateText(planningPrompt);

    return this.parsePlanningWithRecovery(
      responseText,
      input.message.conversation_id,
    );
  }

  private async parsePlanningWithRecovery(
    responseText: string,
    conversationId: string,
  ): Promise<Awaited<ReturnType<typeof assistantPlanningOutputParser.parse>>> {
    return this.parseWithRecovery(
      'planning',
      responseText,
      assistantPlanningOutputParser.parse.bind(assistantPlanningOutputParser),
      conversationId,
    );
  }

  private async parseSynthesisWithRecovery(
    responseText: string,
    conversationId: string,
  ): Promise<AssistantLlmGenerateResult> {
    return this.parseWithRecovery(
      'synthesis',
      responseText,
      assistantSynthesisOutputParser.parse.bind(assistantSynthesisOutputParser),
      conversationId,
    );
  }

  private async parseWithRecovery<T>(
    phase: 'planning' | 'synthesis',
    responseText: string,
    parser: (text: string) => Promise<T>,
    conversationId: string,
  ): Promise<T> {
    const normalizedCandidates = this.buildParseCandidates(responseText, phase);
    let lastError: unknown = null;

    for (const candidate of normalizedCandidates) {
      try {
        return await parser(candidate);
      } catch (error) {
        lastError = error;
      }
    }

    for (
      let attempt = 1;
      attempt <= AssistantLangchainRuntimeService.MAX_PARSE_REPAIR_ATTEMPTS;
      attempt += 1
    ) {
      this.logger.warn(
        `${phase} parse failed conversationId=${conversationId} attempt=${String(
          attempt,
        )}; requesting repair`,
      );
      const repairPrompt = this.buildParseRepairPrompt(
        phase,
        responseText,
      );
      const repairedResponse = await this.llmProvider.generateText(repairPrompt);
      const repairedCandidates = this.buildParseCandidates(repairedResponse, phase);

      for (const candidate of repairedCandidates) {
        try {
          return await parser(candidate);
        } catch (error) {
          lastError = error;
        }
      }
    }

    if (phase === 'planning') {
      const fallback = this.buildPlanningFallbackResult(responseText);
      if (fallback) {
        this.logger.warn(
          `planning parse fallback used conversationId=${conversationId}; returning deterministic final`,
        );
        try {
          return await parser(fallback);
        } catch (error) {
          lastError = error;
        }
      }
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
            'Return exactly ONE JSON object in one of these two forms:',
            '1) {"final":{"message":"...","context":"...","memory_writes":[],"tool_observations":[]}}',
            '2) {"tool_call":{"name":"time_current","arguments":{}}}',
            'Allowed tool names:',
            '["conversation_search","memory_search_federated","memory_search_preference","memory_search_fact","memory_search_routine","memory_search_project","memory_search_episode","memory_search_rule","memory_write_preference","memory_write_fact","memory_write_routine","memory_write_project","memory_write_episode","memory_write_rule","skill_execute","time_current","web_search"]',
            'If you choose tool_call, include arguments as JSON object (use {} when empty).',
            'Do not include both final and tool_call.',
            'Do not include any other top-level fields.',
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

      const toolCall = parsed.tool_call;
      if (!toolCall || typeof toolCall !== 'object' || Array.isArray(toolCall)) {
        return null;
      }

      const normalizedToolCall = { ...(toolCall as Record<string, unknown>) };
      const rawName = normalizedToolCall.name;
      if (typeof rawName === 'string' && rawName.includes('|')) {
        const firstTool = rawName
          .split('|')
          .map((value) => value.trim())
          .find((value) => value.length > 0);
        if (firstTool) {
          normalizedToolCall.name = firstTool;
        }
      }

      const rawArguments = normalizedToolCall.arguments;
      if (
        typeof rawArguments !== 'object' ||
        rawArguments === null ||
        Array.isArray(rawArguments)
      ) {
        normalizedToolCall.arguments = {};
      }

      return JSON.stringify({
        ...parsed,
        tool_call: normalizedToolCall,
      });
    } catch {
      return null;
    }
  }

  private buildPlanningFallbackResult(responseText: string): string | null {
    try {
      const candidate = this.extractFirstJsonObject(this.unwrapJsonFence(responseText.trim()));
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const currentUserMessage = parsed.current_user_message;
      if (
        !currentUserMessage ||
        typeof currentUserMessage !== 'object' ||
        Array.isArray(currentUserMessage)
      ) {
        return null;
      }

      const message = (currentUserMessage as Record<string, unknown>).message;
      const isRussian =
        typeof message === 'string' &&
        /[А-Яа-яЁё]/.test(message);

      return JSON.stringify({
        final: {
          context: 'LLM planning output was invalid and fallback response was used.',
          memory_writes: [],
          message: isRussian
            ? 'Не удалось корректно обработать ответ модели. Попробуйте выбрать другую LLM модель в настройках.'
            : 'Could not parse the model response correctly. Try selecting a different LLM model in settings.',
          tool_observations: [],
        },
      });
    } catch {
      return null;
    }
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
}
