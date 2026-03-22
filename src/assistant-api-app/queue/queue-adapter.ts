export interface QueueMessage {
  callback_url: string;
  chat: string;
  contact: string;
  direction: string;
  message: string;
}

export interface QueueAdapter {
  depth(): Promise<number>;
  driverName(): string;
  enqueue(message: QueueMessage): Promise<void>;
}

export const QUEUE_ADAPTER = Symbol('QUEUE_ADAPTER');

