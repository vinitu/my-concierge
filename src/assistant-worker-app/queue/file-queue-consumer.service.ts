import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
} from 'node:fs/promises';
import { join } from 'node:path';
import type { ExecutionJob } from '../../contracts/assistant-transport';
import type {
  ProcessingQueueMessage,
  QueueConsumer,
} from './queue-consumer';

@Injectable()
export class FileQueueConsumerService implements QueueConsumer {
  constructor(private readonly configService: ConfigService) {}

  driverName(): string {
    return 'file';
  }

  async reserveNext(): Promise<ProcessingQueueMessage | null> {
    const directory = await this.ensureQueueDirectory();
    const entries = await readdir(directory, { withFileTypes: true });
    const file = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .sort((a, b) => a.name.localeCompare(b.name))[0];

    if (!file) {
      return null;
    }

    const sourcePath = join(directory, file.name);
    const processingPath = `${sourcePath}.processing`;

    await rename(sourcePath, processingPath);
    const payload = JSON.parse(await readFile(processingPath, 'utf8')) as ExecutionJob;

    return {
      ...payload,
      processingToken: processingPath,
    };
  }

  async markDone(message: ProcessingQueueMessage): Promise<void> {
    await rm(message.processingToken, { force: true });
  }

  async markFailed(message: ProcessingQueueMessage): Promise<void> {
    const processingPath = message.processingToken;

    if (!processingPath.endsWith('.processing')) {
      return;
    }

    const failedPath = `${processingPath.slice(0, -'.processing'.length)}.failed`;
    await rename(processingPath, failedPath);
  }

  async depth(): Promise<number> {
    const directory = await this.ensureQueueDirectory();
    const entries = await readdir(directory, { withFileTypes: true });

    return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).length;
  }

  private async ensureQueueDirectory(): Promise<string> {
    const configuredPath = this.configService.get<string>(
      'FILE_QUEUE_DIR',
      join(process.cwd(), 'runtime', 'data', 'assistant-api-queue'),
    );

    await mkdir(configuredPath, { recursive: true });
    return configuredPath;
  }
}
