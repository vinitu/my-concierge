import type { ExecutionJob } from '../../contracts/assistant-transport';

export interface ProcessingQueueMessage extends ExecutionJob {
  processingToken: string;
}

export interface QueueConsumer {
  depth(): Promise<number>;
  driverName(): string;
  markDone(message: ProcessingQueueMessage): Promise<void>;
  markFailed(message: ProcessingQueueMessage): Promise<void>;
  reserveNext(): Promise<ProcessingQueueMessage | null>;
}

export const WORKER_QUEUE_CONSUMER = Symbol('WORKER_QUEUE_CONSUMER');
