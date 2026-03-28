import type { ExecutionJob } from '../../contracts/assistant-transport';

export interface QueueAdapter {
  depth(): Promise<number>;
  driverName(): string;
  enqueue(message: ExecutionJob): Promise<void>;
}

export const QUEUE_ADAPTER = Symbol('QUEUE_ADAPTER');
