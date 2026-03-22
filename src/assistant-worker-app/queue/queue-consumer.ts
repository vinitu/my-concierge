import type { QueueMessage } from '../../assistant-api-app/queue/queue-adapter';

export interface ProcessingQueueMessage extends QueueMessage {
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

