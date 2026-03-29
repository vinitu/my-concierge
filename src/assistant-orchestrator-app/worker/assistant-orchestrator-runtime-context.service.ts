import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  readdir,
  readFile,
} from 'node:fs/promises';
import { join, relative } from 'node:path';

interface RuntimeMemoryEntry {
  content: string;
  path: string;
}

export interface AssistantOrchestratorRuntimeContext {
  agents: string | null;
  datadir: string;
  identity: string | null;
  memory: RuntimeMemoryEntry[];
  soul: string | null;
}

@Injectable()
export class AssistantOrchestratorRuntimeContextService {
  constructor(private readonly configService: ConfigService) {}

  async load(): Promise<AssistantOrchestratorRuntimeContext> {
    const datadir = this.configService.get<string>(
      'ASSISTANT_DATADIR',
      join(process.cwd(), 'runtime', 'assistant-orchestrator'),
    );

    const system = await this.readOptionalFile(join(datadir, 'SYSTEM.js'));
    const legacySoul = await this.readOptionalFile(join(datadir, 'SOUL.js'));
    const legacyIdentity = await this.readOptionalFile(join(datadir, 'IDENTITY.js'));

    return {
      agents: system ?? this.mergeLegacySystemFiles(legacySoul, legacyIdentity),
      datadir,
      identity: null,
      memory: await this.readMemoryDirectory(datadir),
      soul: null,
    };
  }

  private mergeLegacySystemFiles(
    soul: string | null,
    identity: string | null,
  ): string | null {
    const merged = [
      ...this.parseInstructionArray(identity),
      ...this.parseInstructionArray(soul),
    ];

    if (merged.length === 0) {
      return null;
    }

    return JSON.stringify(merged, null, 2);
  }

  private parseInstructionArray(value: string | null): string[] {
    if (!value) {
      return [];
    }

    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((entry): entry is string => typeof entry === 'string');
      }
    } catch {
      return value.trim().length > 0 ? [value.trim()] : [];
    }

    return [];
  }

  private async readMemoryDirectory(datadir: string): Promise<RuntimeMemoryEntry[]> {
    const memoryRoot = join(datadir, 'memory');
    const files = await this.collectFiles(memoryRoot);

    const memoryEntries = await Promise.all(
      files.map(async (filePath) => ({
        content: await readFile(filePath, 'utf8'),
        path: relative(datadir, filePath),
      })),
    );

    return memoryEntries.sort((a, b) => a.path.localeCompare(b.path));
  }

  private async collectFiles(directory: string): Promise<string[]> {
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      const nested = await Promise.all(
        entries.map(async (entry) => {
          const entryPath = join(directory, entry.name);

          if (entry.isDirectory()) {
            return this.collectFiles(entryPath);
          }

          if (!entry.isFile()) {
            return [];
          }

          return [entryPath];
        }),
      );

      return nested.flat();
    } catch (error) {
      if (this.isMissingPath(error)) {
        return [];
      }

      throw error;
    }
  }

  private async readOptionalFile(path: string): Promise<string | null> {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if (this.isMissingPath(error)) {
        return null;
      }

      throw error;
    }
  }

  private isMissingPath(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    );
  }
}
