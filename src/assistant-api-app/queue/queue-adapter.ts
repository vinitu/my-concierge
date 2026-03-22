export interface QueueMessage {
  chat: string;
  conversation_id: string;
  contact: string;
  direction: string;
  host: string;
  message: string;
}

export interface QueueAdapter {
  depth(): Promise<number>;
  driverName(): string;
  enqueue(message: QueueMessage): Promise<void>;
}

export const QUEUE_ADAPTER = Symbol('QUEUE_ADAPTER');
