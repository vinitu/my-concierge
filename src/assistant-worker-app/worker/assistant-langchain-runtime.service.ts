import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { RunnableLambda, RunnableSequence } from '@langchain/core/runnables';
import type {
  AssistantLlmGenerateInput,
  AssistantLlmProvider,
} from './assistant-llm-provider';
import { ASSISTANT_LLM_PROVIDER } from './assistant-llm-provider';
import {
  type AssistantLlmGenerateResult,
} from './assistant-llm-response-parser';
import {
  assistantPlanningOutputParser,
  assistantSynthesisOutputParser,
} from './assistant-llm-output-schema';
import { AssistantToolDispatcherService } from './assistant-tool-dispatcher.service';
import { AssistantWorkerPromptTemplateService } from './assistant-worker-prompt-template.service';
import { AssistantWorkerRuntimeContextService } from './assistant-worker-runtime-context.service';
import { Inject } from '@nestjs/common';
import { AssistantRuntimeError } from './assistant-runtime-error';
import { AssistantWorkerMetricsService } from '../observability/assistant-worker-metrics.service';

@Injectable()
export class AssistantLangchainRuntimeService {
  private readonly logger = new Logger(AssistantLangchainRuntimeService.name);

  constructor(
    @Inject(ASSISTANT_LLM_PROVIDER)
    private readonly llmProvider: AssistantLlmProvider,
    private readonly assistantToolDispatcherService: AssistantToolDispatcherService,
    private readonly metricsService: AssistantWorkerMetricsService,
    private readonly promptTemplateService: AssistantWorkerPromptTemplateService,
    private readonly runtimeContextService: AssistantWorkerRuntimeContextService,
  ) {}

  async run(input: AssistantLlmGenerateInput): Promise<AssistantLlmGenerateResult> {
    const runtimeContext = await this.runtimeContextService.load();

    try {
      this.metricsService.recordLangchainRun('planning', true);
      this.logger.log(
        `Planning started conversationId=${input.message.conversation_id} retrievedMemory=${String(
          input.retrieved_memory.length,
        )}`,
      );
      const planningChain = RunnableSequence.from<
        AssistantLlmGenerateInput,
        Awaited<ReturnType<typeof assistantPlanningOutputParser.parse>>
      >([
        RunnableLambda.from(async (chainInput: AssistantLlmGenerateInput) =>
          this.promptTemplateService.renderPlanningPrompt(chainInput, runtimeContext),
        ),
        RunnableLambda.from(async (prompt: string) => this.llmProvider.generateText(prompt)),
        RunnableLambda.from((responseText: string) => assistantPlanningOutputParser.parse(responseText)),
      ]);
      const plan = await planningChain.invoke(input);
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
          name: plan.tool_call.name as
            | 'conversation_search'
            | 'memory_search'
            | 'memory_write'
            | 'skill_execute'
            | 'time_current',
        },
        input.message.conversation_id,
      );
      this.metricsService.recordToolInvocation(observation.tool_name, observation.ok);
      this.metricsService.recordLangchainRun('tool_execution', observation.ok);
      this.logger.log(
        `Tool execution conversationId=${input.message.conversation_id} tool=${observation.tool_name} ok=${String(observation.ok)}`,
      );

      const synthesisChain = RunnableSequence.from<
        AssistantLlmGenerateInput,
        AssistantLlmGenerateResult
      >([
        RunnableLambda.from(async (chainInput: AssistantLlmGenerateInput) =>
          this.promptTemplateService.renderSynthesisPrompt(
            chainInput,
            runtimeContext,
            observation,
          ),
        ),
        RunnableLambda.from(async (prompt: string) => this.llmProvider.generateText(prompt)),
        RunnableLambda.from((responseText: string) => assistantSynthesisOutputParser.parse(responseText)),
      ]);
      const result = await synthesisChain.invoke(input);
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
}
