import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  mkdir,
  readdir,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  QueueAdapter,
  QueueMessage,
} from './queue-adapter';

@Injectable()
export class FileQueueAdapter implements QueueAdapter {
  constructor(private readonly configService: ConfigService) {}

  driverName(): string {
    return 'file';
  }

  async enqueue(message: QueueMessage): Promise<void> {
    const directory = await this.ensureQueueDirectory();
    const filename = `${Date.now()}-${randomUUID()}.json`;
    const path = join(directory, filename);
    const payload = {
      ...message,
      accepted_at: new Date().toISOString(),
    };

    await writeFile(path, JSON.stringify(payload, null, 2), 'utf8');
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

