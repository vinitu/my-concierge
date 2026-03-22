import { Injectable } from '@nestjs/common';
import type {
  QueueAdapter,
  QueueMessage,
} from './queue-adapter';

@Injectable()
export class MemoryQueueAdapter implements QueueAdapter {
  private readonly messages: QueueMessage[] = [];

  driverName(): string {
    return 'memory';
  }

  async enqueue(message: QueueMessage): Promise<void> {
    this.messages.push(message);
  }

  async depth(): Promise<number> {
    return this.messages.length;
  }
}

