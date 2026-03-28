import { Injectable } from '@nestjs/common';
import type { ExecutionJob } from '../../contracts/assistant-transport';
import type {
  QueueAdapter,
} from './queue-adapter';

@Injectable()
export class MemoryQueueAdapter implements QueueAdapter {
  private readonly messages: ExecutionJob[] = [];

  driverName(): string {
    return 'memory';
  }

  async enqueue(message: ExecutionJob): Promise<void> {
    this.messages.push(message);
  }

  async depth(): Promise<number> {
    return this.messages.length;
  }
}
