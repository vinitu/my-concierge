import {
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  createClient,
  type RedisClientType,
} from 'redis';
import type { RunEvent } from '../../contracts/assistant-transport';

@Injectable()
export class AssistantMemoryRunEventPublisherService implements OnModuleDestroy {
  private client: RedisClientType | null = null;

  constructor(private readonly configService: ConfigService) {}

  async publish(
    eventType: `memory.${string}`,
    conversationId: string,
    payload: Record<string, unknown>,
    sourceRequestId?: string,
    direction = 'web',
    userId = 'default-user',
  ): Promise<RunEvent> {
    const event: RunEvent = {
      channel: 'memory',
      conversationId,
      createdAt: new Date().toISOString(),
      direction,
      eventType,
      payload,
      requestId: sourceRequestId?.trim() || `memory_${randomUUID()}`,
      userId,
      sequence: 1,
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
