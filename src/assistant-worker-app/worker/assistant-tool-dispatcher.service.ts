import { Injectable } from '@nestjs/common';
import { AssistantMemoryClientService } from './assistant-memory-client.service';
import { AssistantWorkerConversationService } from './assistant-worker-conversation.service';
import type { MemoryWriteCandidate } from '../../contracts/assistant-memory';
import { AssistantRuntimeError } from './assistant-runtime-error';

export interface AssistantToolCall {
  arguments: Record<string, unknown>;
  name:
    | 'conversation_search'
    | 'memory_search'
    | 'memory_write'
    | 'skill_execute'
    | 'time_current';
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
    private readonly conversationService: AssistantWorkerConversationService,
  ) {}

  async execute(
    toolCall: AssistantToolCall,
    conversationId: string,
  ): Promise<AssistantToolObservation> {
    try {
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
        case 'memory_search': {
          const query =
            typeof toolCall.arguments.query === 'string' ? toolCall.arguments.query : '';
          const result = await this.assistantMemoryClientService.search(query, conversationId);
          return {
            ok: true,
            result,
            tool_name: toolCall.name,
          };
        }
        case 'memory_write': {
          const entries = Array.isArray(toolCall.arguments.entries)
            ? (toolCall.arguments.entries as MemoryWriteCandidate[])
            : [];
          const result = await this.assistantMemoryClientService.write(entries);
          return {
            ok: true,
            result: result ?? { created: 0, entries: [], updated: 0 },
            tool_name: toolCall.name,
          };
        }
        case 'conversation_search': {
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
        toolCall.name.startsWith('memory_') ? 'MEMORY_ERROR' : 'TOOL_ERROR',
        `Tool execution failed: ${toolCall.name}`,
        error,
      );
    }
  }
}
