import { Injectable } from '@nestjs/common';
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { AssistantMemoryClientService } from './assistant-memory-client.service';
import { AssistantOrchestratorConversationService } from './assistant-orchestrator-conversation.service';
import type {
  BaseMemoryWriteCandidate,
  MemoryKind,
  MemoryWriteCandidate,
} from '../../contracts/assistant-memory';
import { AssistantRuntimeError } from './assistant-runtime-error';
import type { AssistantToolName } from './assistant-tool-catalog.service';
import { BraveSearchService } from './brave-search.service';
import { AssistantOrchestratorConfigService } from './assistant-orchestrator-config.service';

export interface AssistantToolCall {
  arguments: Record<string, unknown>;
  name: AssistantToolName;
}

export interface AssistantToolObservation {
  arguments?: Record<string, unknown>;
  ok: boolean;
  result: unknown;
  tool_name: AssistantToolCall['name'];
}

@Injectable()
export class AssistantToolDispatcherService {
  constructor(
    private readonly assistantMemoryClientService: AssistantMemoryClientService,
    private readonly braveSearchService: BraveSearchService,
    private readonly assistantOrchestratorConfigService: AssistantOrchestratorConfigService,
    private readonly conversationService: AssistantOrchestratorConversationService,
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
          `Tool is disabled in assistant-orchestrator settings: ${toolCall.name}`,
        );
      }

      switch (toolCall.name) {
        case 'time_current':
          return {
            arguments: toolCall.arguments,
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
            arguments: toolCall.arguments,
            ok: true,
            result,
            tool_name: toolCall.name,
          };
        }
        case 'memory_search': {
          const query =
            typeof toolCall.arguments.query === 'string' ? toolCall.arguments.query : '';
          const result = await this.assistantMemoryClientService.searchFederated(
            query,
            conversationId,
          );
          return {
            arguments: toolCall.arguments,
            ok: true,
            result,
            tool_name: toolCall.name,
          };
        }
        case 'memory_fact_search':
        {
          const query =
            typeof toolCall.arguments.query === 'string' ? toolCall.arguments.query : '';
          const memoryKind = this.kindFromMemoryTool(toolCall.name);
          const result = await this.assistantMemoryClientService.searchByKind(
            memoryKind,
            query,
            conversationId,
          );
          return {
            arguments: toolCall.arguments,
            ok: true,
            result,
            tool_name: toolCall.name,
          };
        }
        case 'memory_fact_write':
        {
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
            arguments: toolCall.arguments,
            ok: true,
            result: result ?? { created: 0, entries: [], updated: 0 },
            tool_name: toolCall.name,
          };
        }
        case 'memory_conversation_search': {
          const limit =
            typeof toolCall.arguments.limit === 'number'
              ? toolCall.arguments.limit
              : 8;
          const result = await this.conversationService.searchThread(conversationId, limit);
          return {
            arguments: toolCall.arguments,
            ok: true,
            result,
            tool_name: toolCall.name,
          };
        }
        case 'skill_execute':
        {
          const result = await this.executeLocalSkill(toolCall.arguments);
          return {
            arguments: toolCall.arguments,
            ok: true,
            result,
            tool_name: toolCall.name,
          };
        }
        case 'directory_list': {
          const result = await this.listDirectory(toolCall.arguments.path);
          return {
            arguments: toolCall.arguments,
            ok: true,
            result,
            tool_name: toolCall.name,
          };
        }
        case 'directory_create': {
          const result = await this.createDirectory(toolCall.arguments.path);
          return {
            arguments: toolCall.arguments,
            ok: true,
            result,
            tool_name: toolCall.name,
          };
        }
        case 'directory_delete': {
          const result = await this.deleteDirectory(toolCall.arguments.path);
          return {
            arguments: toolCall.arguments,
            ok: true,
            result,
            tool_name: toolCall.name,
          };
        }
        case 'file_read': {
          const result = await this.readTextFile(toolCall.arguments.path);
          return {
            arguments: toolCall.arguments,
            ok: true,
            result,
            tool_name: toolCall.name,
          };
        }
        case 'file_write': {
          const result = await this.writeTextFile(
            toolCall.arguments.path,
            toolCall.arguments.content,
          );
          return {
            arguments: toolCall.arguments,
            ok: true,
            result,
            tool_name: toolCall.name,
          };
        }
        case 'file_delete': {
          const result = await this.deleteFile(toolCall.arguments.path);
          return {
            arguments: toolCall.arguments,
            ok: true,
            result,
            tool_name: toolCall.name,
          };
        }
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

  private kindFromMemoryTool(toolName: AssistantToolName): MemoryKind {
    switch (toolName) {
      case 'memory_fact_search':
      case 'memory_fact_write':
        return 'fact';
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
            : `assistant-orchestrator:${kind}`,
        tags: Array.isArray(entry.tags)
          ? entry.tags
              .filter((tag): tag is string => typeof tag === 'string')
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0)
          : [],
      }));
  }

  private async executeLocalSkill(
    value: Record<string, unknown>,
  ): Promise<{
    content: string;
    file_name: string;
    format: 'markdown';
    skill_name: string;
    status: 'loaded';
  }> {
    const requestedName = this.normalizeSkillName(
      value.skill_name ?? value.skill ?? value.name,
    );
    if (!requestedName) {
      throw new AssistantRuntimeError(
        'TOOL_ERROR',
        'skill_execute requires skill_name, skill, or name',
      );
    }

    const skillsDirectory = join(
      dirname(this.assistantOrchestratorConfigService.configPath()),
      '..',
      'skills',
    );

    const entries = await readdir(skillsDirectory, { withFileTypes: true }).catch(() => []);
    const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
    const match = files.find((fileName) => this.matchesSkillName(fileName, requestedName));

    if (!match) {
      throw new AssistantRuntimeError(
        'TOOL_ERROR',
        `Local skill not found: ${requestedName}`,
      );
    }

    const content = (await readFile(join(skillsDirectory, match), 'utf8')).trim();
    if (!content) {
      throw new AssistantRuntimeError(
        'TOOL_ERROR',
        `Local skill is empty: ${match}`,
      );
    }

    return {
      content,
      file_name: match,
      format: 'markdown',
      skill_name: requestedName,
      status: 'loaded',
    };
  }

  private matchesSkillName(fileName: string, requestedName: string): boolean {
    const normalizedFileName = fileName.toLowerCase();
    const normalizedBaseName = fileName.slice(0, Math.max(0, fileName.length - extname(fileName).length)).toLowerCase();
    return (
      normalizedFileName === requestedName ||
      normalizedBaseName === requestedName ||
      `${normalizedBaseName}.md` === requestedName
    );
  }

  private normalizeSkillName(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim().toLowerCase().replaceAll('\\', '/').split('/').pop() ?? '';
    return normalized.length > 0 ? normalized : null;
  }

  private async listDirectory(pathValue: unknown): Promise<{
    entries: Array<{ name: string; path: string; type: 'directory' | 'file' | 'other' }>;
    path: string;
  }> {
    const target = this.resolveSandboxPath(pathValue, '.');
    const targetStat = await stat(target.absolutePath).catch(() => null);

    if (!targetStat || !targetStat.isDirectory()) {
      throw new AssistantRuntimeError(
        'TOOL_ERROR',
        `Directory does not exist inside assistant home: ${target.relativePath}`,
      );
    }

    const entries = await readdir(target.absolutePath, { withFileTypes: true });
    const normalizedEntries: Array<{
      name: string;
      path: string;
      type: 'directory' | 'file' | 'other';
    }> = entries.map((entry) => ({
      name: entry.name,
      path:
        target.relativePath === '.'
          ? entry.name
          : `${target.relativePath}/${entry.name}`,
      type: entry.isDirectory()
        ? 'directory'
        : entry.isFile()
          ? 'file'
          : 'other',
    }));
    return {
      entries: normalizedEntries.sort((left, right) => left.path.localeCompare(right.path)),
      path: target.relativePath,
    };
  }

  private async createDirectory(pathValue: unknown): Promise<{
    created: true;
    path: string;
  }> {
    const target = this.resolveSandboxRequiredPath(pathValue);
    await mkdir(target.absolutePath, { recursive: true });
    return {
      created: true,
      path: target.relativePath,
    };
  }

  private async deleteDirectory(pathValue: unknown): Promise<{
    deleted: true;
    path: string;
  }> {
    const target = this.resolveSandboxRequiredPath(pathValue);

    if (target.relativePath === '.') {
      throw new AssistantRuntimeError(
        'TOOL_ERROR',
        'directory_delete cannot remove the assistant home root',
      );
    }

    const targetStat = await stat(target.absolutePath).catch(() => null);
    if (!targetStat || !targetStat.isDirectory()) {
      throw new AssistantRuntimeError(
        'TOOL_ERROR',
        `Directory does not exist inside assistant home: ${target.relativePath}`,
      );
    }

    await rm(target.absolutePath, { force: false, recursive: true });
    return {
      deleted: true,
      path: target.relativePath,
    };
  }

  private async readTextFile(pathValue: unknown): Promise<{
    content: string;
    path: string;
  }> {
    const target = this.resolveSandboxRequiredPath(pathValue);
    const targetStat = await stat(target.absolutePath).catch(() => null);

    if (!targetStat || !targetStat.isFile()) {
      throw new AssistantRuntimeError(
        'TOOL_ERROR',
        `File does not exist inside assistant home: ${target.relativePath}`,
      );
    }

    return {
      content: await readFile(target.absolutePath, 'utf8'),
      path: target.relativePath,
    };
  }

  private async writeTextFile(
    pathValue: unknown,
    contentValue: unknown,
  ): Promise<{
    bytes: number;
    path: string;
    written: true;
  }> {
    const target = this.resolveSandboxRequiredPath(pathValue);
    const content = this.requireStringArgument('content', contentValue, true);
    await mkdir(dirname(target.absolutePath), { recursive: true });
    await writeFile(target.absolutePath, content, 'utf8');
    return {
      bytes: Buffer.byteLength(content, 'utf8'),
      path: target.relativePath,
      written: true,
    };
  }

  private async deleteFile(pathValue: unknown): Promise<{
    deleted: true;
    path: string;
  }> {
    const target = this.resolveSandboxRequiredPath(pathValue);
    const targetStat = await stat(target.absolutePath).catch(() => null);

    if (!targetStat || !targetStat.isFile()) {
      throw new AssistantRuntimeError(
        'TOOL_ERROR',
        `File does not exist inside assistant home: ${target.relativePath}`,
      );
    }

    await unlink(target.absolutePath);
    return {
      deleted: true,
      path: target.relativePath,
    };
  }

  private resolveSandboxPath(
    value: unknown,
    fallback: string,
  ): { absolutePath: string; relativePath: string } {
    const raw =
      typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
    const homePath = resolve(this.assistantOrchestratorConfigService.homePath());
    const absolutePath = resolve(homePath, raw);
    const relativePath = relative(homePath, absolutePath).replaceAll('\\', '/');

    if (relativePath === '..' || relativePath.startsWith('../')) {
      throw new AssistantRuntimeError(
        'TOOL_ERROR',
        'Filesystem tool path escapes assistant home',
      );
    }

    return {
      absolutePath,
      relativePath: relativePath || '.',
    };
  }

  private resolveSandboxRequiredPath(
    value: unknown,
  ): { absolutePath: string; relativePath: string } {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new AssistantRuntimeError(
        'TOOL_ERROR',
        'Filesystem tool requires a non-empty path',
      );
    }

    return this.resolveSandboxPath(value, value.trim());
  }

  private requireStringArgument(
    field: string,
    value: unknown,
    allowEmpty: boolean,
  ): string {
    if (typeof value !== 'string') {
      throw new AssistantRuntimeError(
        'TOOL_ERROR',
        `Filesystem tool requires string argument: ${field}`,
      );
    }

    if (!allowEmpty && value.length === 0) {
      throw new AssistantRuntimeError(
        'TOOL_ERROR',
        `Filesystem tool requires non-empty string argument: ${field}`,
      );
    }

    return value;
  }
}
