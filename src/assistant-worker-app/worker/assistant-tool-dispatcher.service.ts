import { Injectable } from '@nestjs/common';
import { AssistantMemoryClientService } from './assistant-memory-client.service';
import { AssistantWorkerConversationService } from './assistant-worker-conversation.service';
import type {
  BaseMemoryWriteCandidate,
  MemoryKind,
  MemoryWriteCandidate,
} from '../../contracts/assistant-memory';
import { AssistantRuntimeError } from './assistant-runtime-error';
import type { AssistantToolName } from './assistant-tool-catalog.service';
import { BraveSearchService } from './brave-search.service';

export interface AssistantToolCall {
  arguments: Record<string, unknown>;
  name: AssistantToolName;
}

export interface AssistantToolObservation {
  ok: boolean;
  result: unknown;
  tool_name: AssistantToolCall['name'];
}

@Injectable()
export class AssistantToolDispatcherService {
  constructor(
    private readonly assistantMemoryClientService: AssistantMemoryClientService,
    private readonly braveSearchService: BraveSearchService,
    private readonly conversationService: AssistantWorkerConversationService,
  ) {}

  async execute(
    toolCall: AssistantToolCall,
    conversationId: string,
    enabledTools?: AssistantToolName[],
  ): Promise<AssistantToolObservation> {
    try {
      if (enabledTools && !enabledTools.includes(toolCall.name)) {
        throw new AssistantRuntimeError(
          'TOOL_ERROR',
          `Tool is disabled in assistant-worker settings: ${toolCall.name}`,
        );
      }

      switch (toolCall.name) {
        case 'time_current':
          return {
            ok: true,
            result: {
              iso: new Date().toISOString(),
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            },
            tool_name: toolCall.name,
          };
        case 'web_search': {
          const query =
            typeof toolCall.arguments.query === 'string' ? toolCall.arguments.query : '';
          const count =
            typeof toolCall.arguments.count === 'number'
              ? toolCall.arguments.count
              : undefined;
          const result = await this.braveSearchService.search(query, count);
          return {
            ok: true,
            result,
            tool_name: toolCall.name,
          };
        }
        case 'mem_search': {
          const query =
            typeof toolCall.arguments.query === 'string' ? toolCall.arguments.query : '';
          const result = await this.assistantMemoryClientService.searchFederated(
            query,
            conversationId,
          );
          return {
            ok: true,
            result,
            tool_name: toolCall.name,
          };
        }
        case 'mem_preference_search':
        case 'mem_fact_search':
        case 'mem_routine_search':
        case 'mem_project_search':
        case 'mem_episode_search':
        case 'mem_rule_search': {
          const query =
            typeof toolCall.arguments.query === 'string' ? toolCall.arguments.query : '';
          const memoryKind = this.kindFromMemoryTool(toolCall.name);
          const result = await this.assistantMemoryClientService.searchByKind(
            memoryKind,
            query,
            conversationId,
          );
          return {
            ok: true,
            result,
            tool_name: toolCall.name,
          };
        }
        case 'mem_preference_write':
        case 'mem_fact_write':
        case 'mem_routine_write':
        case 'mem_project_write':
        case 'mem_episode_write':
        case 'mem_rule_write': {
          const memoryKind = this.kindFromMemoryTool(toolCall.name);
          const entries = this.normalizeTypedWriteEntries(
            memoryKind,
            toolCall.arguments.entries,
          );
          const result = await this.assistantMemoryClientService.writeByKind(
            memoryKind,
            entries,
          );
          return {
            ok: true,
            result: result ?? { created: 0, entries: [], updated: 0 },
            tool_name: toolCall.name,
          };
        }
        case 'mem_conversation_search': {
          const limit =
            typeof toolCall.arguments.limit === 'number'
              ? toolCall.arguments.limit
              : 8;
          const result = await this.conversationService.searchThread(conversationId, limit);
          return {
            ok: true,
            result,
            tool_name: toolCall.name,
          };
        }
        case 'skill_execute':
          return {
            ok: true,
            result: {
              reason: 'assistant-skills service is not implemented yet',
              status: 'not_implemented',
            },
            tool_name: toolCall.name,
          };
        default:
          throw new AssistantRuntimeError('TOOL_ERROR', `Unsupported tool: ${String(toolCall)}`);
      }
    } catch (error) {
      if (error instanceof AssistantRuntimeError) {
        throw error;
      }

      throw new AssistantRuntimeError(
        toolCall.name.startsWith('mem_') ? 'MEMORY_ERROR' : 'TOOL_ERROR',
        `Tool execution failed: ${toolCall.name}`,
        error,
      );
    }
  }

  private kindFromMemoryTool(toolName: AssistantToolName): MemoryKind {
    switch (toolName) {
      case 'mem_preference_search':
      case 'mem_preference_write':
        return 'preference';
      case 'mem_fact_search':
      case 'mem_fact_write':
        return 'fact';
      case 'mem_routine_search':
      case 'mem_routine_write':
        return 'routine';
      case 'mem_project_search':
      case 'mem_project_write':
        return 'project';
      case 'mem_episode_search':
      case 'mem_episode_write':
        return 'episode';
      case 'mem_rule_search':
      case 'mem_rule_write':
        return 'rule';
      default:
        throw new AssistantRuntimeError(
          'TOOL_ERROR',
          `Tool does not map to typed memory kind: ${toolName}`,
        );
    }
  }

  private normalizeTypedWriteEntries(
    kind: MemoryKind,
    value: unknown,
  ): BaseMemoryWriteCandidate[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((entry): entry is BaseMemoryWriteCandidate | MemoryWriteCandidate =>
        typeof entry === 'object' && entry !== null,
      )
      .map((entry) => {
        if ('kind' in entry) {
          const { kind: ignored, ...rest } = entry;
          return rest;
        }
        return entry as BaseMemoryWriteCandidate;
      })
      .filter((entry) => typeof entry.content === 'string' && entry.content.trim().length > 0)
      .map((entry) => ({
        confidence:
          typeof entry.confidence === 'number' && Number.isFinite(entry.confidence)
            ? entry.confidence
            : 0.6,
        content: entry.content.trim(),
        conversationThreadId:
          typeof entry.conversationThreadId === 'string' && entry.conversationThreadId.trim()
            ? entry.conversationThreadId.trim()
            : undefined,
        scope:
          typeof entry.scope === 'string' && entry.scope.trim()
            ? entry.scope.trim()
            : 'conversation',
        source:
          typeof entry.source === 'string' && entry.source.trim()
            ? entry.source.trim()
            : `assistant-worker:${kind}`,
        tags: Array.isArray(entry.tags)
          ? entry.tags
              .filter((tag): tag is string => typeof tag === 'string')
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0)
          : [],
      }));
  }
}
