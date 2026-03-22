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

export interface AssistantWorkerRuntimeContext {
  agents: string | null;
  datadir: string;
  identity: string | null;
  memory: RuntimeMemoryEntry[];
  soul: string | null;
}

@Injectable()
export class AssistantWorkerRuntimeContextService {
  constructor(private readonly configService: ConfigService) {}

  async load(): Promise<AssistantWorkerRuntimeContext> {
    const datadir = this.configService.get<string>(
      'ASSISTANT_DATADIR',
      join(process.cwd(), 'runtime', 'assistant-worker'),
    );

    return {
      agents: await this.readOptionalFile(join(datadir, 'SYSTEM.js')),
      datadir,
      identity: await this.readOptionalFile(join(datadir, 'IDENTITY.js')),
      memory: await this.readMemoryDirectory(datadir),
      soul: await this.readOptionalFile(join(datadir, 'SOUL.js')),
    };
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
