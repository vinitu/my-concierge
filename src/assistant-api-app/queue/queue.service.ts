import {
  Inject,
  Injectable,
} from '@nestjs/common';
import type { ExecutionJob } from '../../contracts/assistant-transport';
import {
  QUEUE_ADAPTER,
  type QueueAdapter,
} from './queue-adapter';

@Injectable()
export class QueueService {
  constructor(@Inject(QUEUE_ADAPTER) private readonly queueAdapter: QueueAdapter) {}

  async enqueue(message: ExecutionJob): Promise<void> {
    await this.queueAdapter.enqueue(message);
  }

  async depth(): Promise<number> {
    return this.queueAdapter.depth();
  }

  driverName(): string {
    return this.queueAdapter.driverName();
  }
}
