import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createClient,
  type RedisClientType,
} from 'redis';
import type { ExecutionJob } from '../../contracts/assistant-transport';
import type {
  QueueAdapter,
} from './queue-adapter';

@Injectable()
export class RedisQueueAdapter implements QueueAdapter, OnModuleDestroy {
  private client: RedisClientType | null = null;

  constructor(private readonly configService: ConfigService) {}

  driverName(): string {
    return 'redis';
  }

  async enqueue(message: ExecutionJob): Promise<void> {
    const client = await this.getClient();
    await client.rPush(this.queueName(), JSON.stringify(message));
  }

  async depth(): Promise<number> {
    const client = await this.getClient();
    return client.lLen(this.queueName());
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }

  private async getClient(): Promise<RedisClientType> {
    if (!this.client) {
      this.client = createClient({
        url: this.configService.get<string>('REDIS_URL', 'redis://127.0.0.1:6379'),
      });
      await this.client.connect();
    }

    return this.client;
  }

  private queueName(): string {
    return this.configService.get<string>('REDIS_QUEUE_NAME', 'assistant:jobs');
  }
}
