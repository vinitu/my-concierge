import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssistantOrchestratorMetricsService } from '../observability/assistant-orchestrator-metrics.service';
import {
  type ProcessingQueueMessage,
  WORKER_QUEUE_CONSUMER,
  type QueueConsumer,
} from '../queue/queue-consumer';
import { AssistantOrchestratorConversationService } from './assistant-orchestrator-conversation.service';
import { AssistantRuntimeService } from './assistant-runtime.service';
import { AssistantMemoryClientService } from './assistant-memory-client.service';
import { AssistantLlmProviderStatusService } from './assistant-llm-provider-status.service';
import {
  type AssistantOrchestratorConfig,
  AssistantOrchestratorConfigService,
} from './assistant-orchestrator-config.service';
import {
  RUN_EVENT_PUBLISHER,
  type RunEventPublisher,
} from '../run-events/run-event-publisher';
import { AssistantRuntimeError } from './assistant-runtime-error';
import type {
  AssistantConversationMessage,
  AssistantConversationState,
} from './assistant-orchestrator-conversation.service';
import type { AssistantLlmGenerateInput } from './assistant-llm-provider';
import type { AssistantToolObservation } from './assistant-tool-dispatcher.service';
import { SUPPORTED_ASSISTANT_TOOL_NAMES } from './assistant-tool-catalog.service';

@Injectable()
export class AssistantOrchestratorProcessorService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AssistantOrchestratorProcessorService.name);
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(
    private readonly assistantOrchestratorConfigService: AssistantOrchestratorConfigService,
    private readonly assistantRuntimeService: AssistantRuntimeService,
    private readonly assistantLlmProviderStatusService: AssistantLlmProviderStatusService,
    private readonly assistantMemoryClientService: AssistantMemoryClientService,
    private readonly conversationService: AssistantOrchestratorConversationService,
    private readonly configService: ConfigService,
    private readonly metricsService: AssistantOrchestratorMetricsService,
    @Inject(WORKER_QUEUE_CONSUMER)
    private readonly queueConsumer: QueueConsumer,
    @Inject(RUN_EVENT_PUBLISHER)
    private readonly runEventPublisher: RunEventPublisher,
  ) {}

  onModuleInit(): void {
    const pollIntervalMs = Number.parseInt(
      this.configService.get<string>('WORKER_POLL_INTERVAL_MS', '500'),
      10,
    );

    this.timer = setInterval(() => {
      void this.processOnce();
    }, pollIntervalMs);

    void this.syncQueueDepth();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async processOnce(): Promise<void> {
    if (this.processing) {
      return;
    }

    this.processing = true;

    try {
      const item = await this.queueConsumer.reserveNext();

      if (!item) {
        await this.syncQueueDepth();
        return;
      }

      this.logger.log(
        `Reserved job requestId=${item.request_id} conversationId=${item.conversation_id} providerPending`,
      );
      await this.handleMessage(item);
      await this.queueConsumer.markDone(item);
      this.metricsService.recordProcessedJob();
      this.logger.log(
        `Completed job requestId=${item.request_id} conversationId=${item.conversation_id}`,
      );
    } catch (error) {
      if (this.isProcessingQueueMessage(error)) {
        this.logger.warn(
          `Marking job as failed requestId=${error.request_id} conversationId=${error.conversation_id}`,
        );
        await this.queueConsumer.markFailed(error);
      }
    } finally {
      await this.syncQueueDepth();
      this.processing = false;
    }
  }

  private async handleMessage(item: ProcessingQueueMessage): Promise<void> {
    const requestId = item.request_id;
    const startedAt = Date.now();
    let sequence = 0;
    let workerConfig: AssistantOrchestratorConfig | null = null;
    let currentProvider: 'deepseek' | 'ollama' | 'xai' = 'ollama';
    let stopThinking: (() => void) | null = null;

    try {
      workerConfig = await this.assistantOrchestratorConfigService.read();
      this.logger.log(
        `Starting run requestId=${requestId} conversationId=${item.conversation_id}`,
      );
      await this.publishRunEvent(item, ++sequence, 'run.started', {});
      const providerStatus = await this.assistantLlmProviderStatusService.getStatus();
      currentProvider = providerStatus.provider;
      this.logger.log(
        `Provider preflight requestId=${requestId} status=${providerStatus.status} provider=${providerStatus.provider} enabled=${String(providerStatus.enabled)}`,
      );

      if (!providerStatus.enabled) {
        throw new AssistantRuntimeError(
          'PROVIDER_ERROR',
          `assistant-orchestrator is not ready: ${providerStatus.status}. Open the assistant-llm web panel and fix the AI settings.`,
        );
      }

      this.logger.log(
        `Reading conversation state requestId=${requestId} conversationId=${item.conversation_id}`,
      );
      const conversation = await this.conversationService.read(item);
      const effectiveConversation = await this.buildEffectiveConversation(
        item,
        conversation,
        workerConfig.memory_window,
      );
      this.logger.log(
        `Conversation state loaded requestId=${requestId} conversationId=${item.conversation_id} messageCount=${String(
          effectiveConversation.messages.length,
        )}`,
      );
      this.logger.log(
        `Starting memory search requestId=${requestId} conversationId=${item.conversation_id}`,
      );
      const factQuery = this.latestUserMessageForFactSearch(
        effectiveConversation.messages,
        item.message,
      );
      this.logger.log(
        `Fact search query selected requestId=${requestId} conversationId=${item.conversation_id} queryLen=${String(
          factQuery.length,
        )}`,
      );
      const memorySearch = await this.assistantMemoryClientService.safeSearch(
        factQuery,
        item.conversation_id,
      );
      this.logger.log(
        `Memory search finished requestId=${requestId} conversationId=${item.conversation_id} entries=${String(
          memorySearch.entries.length,
        )}`,
      );
      this.logger.log(
        `Loaded run context requestId=${requestId} messages=${String(effectiveConversation.messages.length)} retrievedMemory=${String(memorySearch.entries.length)}`,
      );

      stopThinking = this.startThinkingLoop(item, workerConfig, requestId, () => ++sequence);
      const enabledTools = this.effectiveEnabledTools(workerConfig);
      const runtimeResult = await this.withRunTimeout(
        this.assistantRuntimeService.run({
          conversation: effectiveConversation,
          message: item,
          retrieved_memory: memorySearch.entries,
        }, enabledTools),
        workerConfig.run_timeout_seconds,
      );
      const result = runtimeResult;

      stopThinking();
      stopThinking = null;
      await this.conversationService.appendExchange(item, result, requestId);
      await this.assistantMemoryClientService.safeWrite(
        this.buildMemoryCandidates(item, effectiveConversation.context, result.context),
      );
      for (const observation of this.toolObservationsFromResult(result.tool_observations)) {
        await this.publishRunEvent(item, ++sequence, 'run.tool', {
          message: this.messageForToolObservation(observation),
          ok: observation.ok,
          payload: observation.result,
          tool_name: observation.tool_name,
        });
      }
      await this.publishRunEvent(item, ++sequence, 'run.completed', {
        fallback_reason: result.fallback_reason ?? null,
        message: result.message,
      });
      this.logger.log(
        `Run completed requestId=${requestId} durationMs=${String(Date.now() - startedAt)}`,
      );
    } catch (error) {
      stopThinking?.();
      const errorCode = this.classifyErrorCode(error);
      const userFacingMessage = this.userFacingFailureMessage(
        error,
        currentProvider,
      );
      await this.publishFailureBestEffort(
        item,
        ++sequence,
        errorCode,
        userFacingMessage,
      );
      this.logger.error(
        `Run failed requestId=${requestId} code=${errorCode} durationMs=${String(
          Date.now() - startedAt,
        )} message=${this.unwrapErrorMessage(error)}`,
      );
      this.logger.warn(
        `Delivered failure message requestId=${requestId}: ${userFacingMessage}`,
      );
      throw item;
    }
  }

  private async publishFailureBestEffort(
    item: ProcessingQueueMessage,
    sequence: number,
    code: string,
    message: string,
  ): Promise<void> {
    try {
      await this.publishRunEvent(item, sequence, 'run.failed', {
        code,
        message,
      });
      return;
    } catch (error) {
      this.logger.error(
        `Failed to publish run.failed event requestId=${item.request_id}: ${this.unwrapErrorMessage(
          error,
        )}`,
      );
    }
  }

  private effectiveEnabledTools(
    config: AssistantOrchestratorConfig,
  ): AssistantOrchestratorConfig['enabled_tools'] {
    return config.enabled_tools;
  }

  private async buildEffectiveConversation(
    item: ProcessingQueueMessage,
    conversation: AssistantConversationState,
    memoryWindow: number,
  ): Promise<AssistantConversationState> {
    const expansionDecision = this.shouldExpandConversationContext(
      item.message,
      conversation.context,
    );

    if (!expansionDecision.expand) {
      this.metricsService.recordContextExpansion(expansionDecision.reason, true);
      return conversation;
    }

    const expandedLimit = Math.min(40, Math.max(memoryWindow * 4, 12));

    try {
      const thread = await this.conversationService.searchThread(
        item.conversation_id,
        expandedLimit,
      );
      const mergedMessages = this.mergeConversationMessages(
        thread.messages,
        conversation.messages,
      );
      const mergedTail = mergedMessages.slice(-expandedLimit);
      const context =
        conversation.context.trim() || thread.summary.trim() || conversation.context;

      this.metricsService.recordContextExpansion(expansionDecision.reason, true);
      this.logger.log(
        `Adaptive context expansion conversationId=${item.conversation_id} reason=${expansionDecision.reason} base=${String(
          conversation.messages.length,
        )} expanded=${String(mergedTail.length)}`,
      );

      return {
        ...conversation,
        context,
        messages: mergedTail,
      };
    } catch (error) {
      this.metricsService.recordContextExpansion(expansionDecision.reason, false);
      this.logger.warn(
        `Adaptive context expansion failed conversationId=${item.conversation_id} reason=${expansionDecision.reason}: ${this.unwrapErrorMessage(
          error,
        )}`,
      );
      return conversation;
    }
  }

  private shouldExpandConversationContext(
    userMessage: string,
    compactContext: string,
  ): { expand: boolean; reason: string } {
    const normalizedMessage = userMessage.trim().toLowerCase();

    if (!normalizedMessage) {
      return { expand: false, reason: 'empty_message' };
    }

    const explicitHistoryPattern =
      /(как\s+(раньше|в\s+прошл|мы\s+решили|договаривались)|мы\s+решили|что\s+мы\s+решили|договаривались|продолж(им|ай)|напомни|вернись|предыдущ|снова|ещ[её]\s+раз|what did we decide|as before|continue|previous|remind me|again)/i;

    if (explicitHistoryPattern.test(normalizedMessage)) {
      return { expand: true, reason: 'history_reference' };
    }

    const referentialPattern =
      /\b(это|эта|этот|этом|эту|тот|та|те|this|that|it|they|them|he|she)\b/i;
    const shortMessage = normalizedMessage.length <= 80;
    const hasCompactContext = compactContext.trim().length > 0;

    if (shortMessage && hasCompactContext && referentialPattern.test(normalizedMessage)) {
      return { expand: true, reason: 'referential_short_message' };
    }

    return { expand: false, reason: 'not_needed' };
  }

  private mergeConversationMessages(
    historical: AssistantConversationMessage[],
    recent: AssistantConversationMessage[],
  ): AssistantConversationMessage[] {
    const combined = [...historical, ...recent];
    const seen = new Set<string>();
    const deduped: AssistantConversationMessage[] = [];

    for (const message of combined) {
      const key = `${message.created_at}|${message.role}|${message.content}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      deduped.push(message);
    }

    return deduped;
  }

  private latestUserMessageForFactSearch(
    messages: AssistantConversationMessage[],
    fallback: string,
  ): string {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role !== 'user') {
        continue;
      }
      const content = message.content.trim();
      if (content.length > 0) {
        return content;
      }
    }
    return fallback.trim();
  }

  private buildMemoryCandidates(
    item: ProcessingQueueMessage,
    previousContext: string,
    nextContext: string,
  ): Array<{
    confidence: number;
    content: string;
    conversationThreadId: string;
    kind: 'episode';
    scope: 'conversation';
    source: 'assistant-orchestrator';
    tags: string[];
  }> {
    const context = nextContext.trim();

    if (
      context.length === 0 ||
      context === previousContext.trim() ||
      this.isConversationMemoryNoise(context)
    ) {
      return [];
    }

    return [
      {
        confidence: 0.75,
        content: context,
        conversationThreadId: item.conversation_id,
        kind: 'episode',
        scope: 'conversation',
        source: 'assistant-orchestrator',
        tags: [item.direction, item.chat],
      },
    ];
  }

  private isConversationMemoryNoise(context: string): boolean {
    const normalized = context.trim().toLowerCase();

    if (normalized.length < 24) {
      return true;
    }

    if (
      /^(user said|user asked|assistant replied)\b/.test(normalized) ||
      /^(greeting|small talk)\b/.test(normalized)
    ) {
      return true;
    }

    return /^(привет|здравствуйте|hello|hi|hey|ghbdtn|как дела)[!.?,\s]*$/i.test(
      normalized,
    );
  }

  private startThinkingLoop(
    item: ProcessingQueueMessage,
    workerConfig: AssistantOrchestratorConfig,
    requestId: string,
    nextSequence: () => number,
  ): () => void {
    const delayMs = workerConfig.thinking_interval_seconds * 1000;

    const timer = setInterval(() => {
      this.logger.log(
        `Publishing thinking event requestId=${requestId} every=${String(workerConfig.thinking_interval_seconds)}s`,
      );
      void this.publishRunEvent(
        item,
        nextSequence(),
        'run.thinking',
        {
          seconds: workerConfig.thinking_interval_seconds,
        },
      );
    }, delayMs);

    return () => {
      clearInterval(timer);
    };
  }

  private async syncQueueDepth(): Promise<void> {
    this.metricsService.setQueueDepth(await this.queueConsumer.depth());
  }

  private async publishRunEvent(
    item: ProcessingQueueMessage,
    sequence: number,
    eventType:
      | 'run.started'
      | 'run.thinking'
      | 'run.tool'
      | 'run.completed'
      | 'run.failed',
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.runEventPublisher.publish({
        conversationId: item.conversation_id,
        direction: item.direction,
        eventType,
        payload,
        requestId: item.request_id,
        userId: item.user_id || item.contact || 'default-user',
        sequence,
      });
      this.metricsService.recordRunEvent(eventType, true);
      this.logger.log(
        `Published run event requestId=${item.request_id} eventType=${eventType} sequence=${String(sequence)}`,
      );
    } catch (error) {
      this.metricsService.recordRunEvent(eventType, false);
      this.logger.error(
        `Failed to publish run event requestId=${item.request_id} eventType=${eventType}: ${this.unwrapErrorMessage(
          error,
        )}`,
      );
      throw error;
    }
  }

  private isProcessingQueueMessage(value: unknown): value is ProcessingQueueMessage {
    return (
      typeof value === 'object' &&
      value !== null &&
      'processingToken' in value &&
      typeof value.processingToken === 'string'
    );
  }

  private classifyErrorCode(error: unknown): string {
    if (error instanceof AssistantRuntimeError) {
      return error.code;
    }

    if (
      error instanceof Error &&
      (error.message.includes('assistant-memory returned') ||
        error.message.toLowerCase().includes('assistant-memory schema') ||
        error.message.toLowerCase().includes('conversation_threads'))
    ) {
      return 'PERSISTENCE_ERROR';
    }

    return 'RUN_FAILED';
  }

  private userFacingFailureMessage(
    error: unknown,
    provider?: 'deepseek' | 'ollama' | 'xai',
  ): string {
    const message = this.unwrapErrorMessage(error).toLowerCase();

    if (message.includes('api key is not configured')) {
      if (message.includes('brave')) {
        return 'assistant-orchestrator web search is enabled, but the Brave API key is missing. Open the Tools section in the assistant-orchestrator web panel and save the Brave settings.';
      }
      return `assistant-orchestrator is not configured: ${this.providerLabel(
        provider ?? 'deepseek',
      )} API key is missing. Open the assistant-llm web panel and save the AI settings.`;
    }

    if (message.includes('timed out')) {
      if (message.includes('brave')) {
        return 'assistant-orchestrator web search timed out while calling Brave. Increase the Brave timeout or try again later.';
      }
      return `assistant-orchestrator timed out while waiting for ${this.providerLabel(
        provider ?? 'deepseek',
      )}. Reduce the model timeout or switch the provider in the assistant-llm web panel.`;
    }

    if (message.includes('returned 401') || message.includes('returned 403')) {
      if (message.includes('brave')) {
        return 'assistant-orchestrator could not authenticate with Brave web search. Check the Brave API key in the Tools section.';
      }
      return `assistant-orchestrator could not authenticate with ${this.providerLabel(
        provider ?? 'deepseek',
      )}. Check the AI settings in the assistant-llm web panel.`;
    }

    if (message.includes('brave web search returned')) {
      return 'assistant-orchestrator web search failed because Brave returned an error. Check the Brave settings or try again later.';
    }

    if (message.includes('brave web search request failed')) {
      return 'assistant-orchestrator could not reach Brave web search. Check the Brave base URL, timeout, or network connectivity.';
    }

    if (message.includes('tool is disabled in assistant-orchestrator settings:')) {
      const toolName = this.extractDisabledToolName(this.unwrapErrorMessage(error));
      return `assistant-orchestrator tried to use a disabled tool: ${toolName}. Enable it in the Tools section or keep only the tools you want the model to use.`;
    }

    if (message.includes('ollama')) {
      return 'assistant-orchestrator could not reach Ollama or the selected local model is unavailable. Check the AI settings in the assistant-llm web panel.';
    }

    if (message.includes('assistant-memory schema is outdated')) {
      return 'assistant-memory uses an old conversation schema. Run `npm run db:migrate` and restart the stack.';
    }

    if (message.includes('missing assistant-memory schema table')) {
      return 'assistant-memory schema is not ready. Run `npm run db:migrate` and restart the stack.';
    }

    if (message.includes('missing mysql schema table')) {
      return 'assistant-memory conversation schema is not ready. Run `npm run db:migrate` and restart the stack.';
    }

    if (message.includes('assistant-memory returned')) {
      return 'assistant-orchestrator could not save conversation state in assistant-memory. Check assistant-memory logs and run `npm run db:migrate`.';
    }

    return `assistant-orchestrator failed while processing the message. Check the ${this.providerLabel(
      provider ?? 'deepseek',
    )} configuration in the assistant-llm web panel.`;
  }

  private unwrapErrorMessage(error: unknown): string {
    if (error instanceof AssistantRuntimeError && error.cause instanceof Error) {
      return error.cause.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  private toolObservationsFromResult(
    value: Array<Record<string, unknown>> | undefined,
  ): AssistantToolObservation[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const observations: AssistantToolObservation[] = [];

    for (const entry of value) {
      const toolName = entry?.tool_name;
      if (
        typeof toolName !== 'string' ||
        !SUPPORTED_ASSISTANT_TOOL_NAMES.includes(
          toolName as (typeof SUPPORTED_ASSISTANT_TOOL_NAMES)[number],
        ) ||
        typeof entry?.ok !== 'boolean'
      ) {
        continue;
      }

      observations.push({
        ok: entry.ok,
        result: entry.result,
        tool_name: toolName as AssistantToolObservation['tool_name'],
      });
    }

    return observations;
  }

  private messageForToolObservation(observation: AssistantToolObservation): string {
    const prefix = observation.ok ? 'Executed' : 'Failed';
    return `${prefix} ${observation.tool_name}.`;
  }

  private extractDisabledToolName(message: string): string {
    const match = message.match(
      /Tool is disabled in assistant-orchestrator settings:\s*([a-z_]+)/i,
    );

    return match?.[1] ?? 'unknown_tool';
  }

  private providerLabel(provider: 'deepseek' | 'ollama' | 'xai'): string {
    switch (provider) {
      case 'xai':
        return 'xAI';
      case 'deepseek':
        return 'DeepSeek';
      case 'ollama':
        return 'Ollama';
    }
  }

  private async withRunTimeout<T>(promise: Promise<T>, timeoutSeconds: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new AssistantRuntimeError(
            'PROVIDER_ERROR',
            `Assistant run timed out after ${String(timeoutSeconds)} seconds`,
          ),
        );
      }, timeoutSeconds * 1000);

      void promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }
}
