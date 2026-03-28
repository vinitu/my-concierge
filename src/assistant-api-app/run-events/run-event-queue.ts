import type { RunEvent } from '../../contracts/assistant-transport';

export interface RunEventQueueConsumer {
  consumeNext(): Promise<RunEvent | null>;
  driverName(): string;
}

export const RUN_EVENT_QUEUE_CONSUMER = Symbol('RUN_EVENT_QUEUE_CONSUMER');
