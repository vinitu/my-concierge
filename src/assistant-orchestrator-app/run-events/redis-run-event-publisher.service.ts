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
import type {
  PublishRunEventInput,
  RunEventPublisher,
} from './run-event-publisher';

@Injectable()
export class RedisRunEventPublisherService
  implements RunEventPublisher, OnModuleDestroy
{
  private client: RedisClientType | null = null;

  constructor(private readonly configService: ConfigService) {}

  driverName(): string {
    return 'redis';
  }

  async publish(input: PublishRunEventInput): Promise<RunEvent> {
    const event: RunEvent = {
      channel: 'gateway',
      conversationId: input.conversationId,
      createdAt: new Date().toISOString(),
      direction: input.direction,
      eventType: input.eventType,
      payload: input.payload,
      requestId: input.requestId,
      userId: input.userId,
      sequence: input.sequence,
    };
    const client = await this.getClient();
    await client.rPush(this.queueName(), JSON.stringify(event));
    return event;
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
