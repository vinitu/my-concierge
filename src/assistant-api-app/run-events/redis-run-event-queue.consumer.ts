import {
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createClient,
  type RedisClientType,
} from 'redis';
import type { RunEvent } from '../../contracts/assistant-transport';
import type { RunEventQueueConsumer } from './run-event-queue';

@Injectable()
export class RedisRunEventQueueConsumer
  implements RunEventQueueConsumer, OnModuleDestroy
{
  private client: RedisClientType | null = null;

  constructor(private readonly configService: ConfigService) {}

  driverName(): string {
    return 'redis';
  }

  async consumeNext(): Promise<RunEvent | null> {
    const client = await this.getClient();
    const payload = await client.brPop(this.queueName(), 1);

    if (!payload?.element) {
      return null;
    }

    return JSON.parse(payload.element) as RunEvent;
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
    return this.configService.get<string>(
      'REDIS_RUN_EVENTS_QUEUE_NAME',
      'assistant:run-events',
    );
  }
}
