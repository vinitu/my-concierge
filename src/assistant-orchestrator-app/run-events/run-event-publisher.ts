import type {
  RunEvent,
  RunEventType,
} from '../../contracts/assistant-transport';

export interface PublishRunEventInput {
  conversationId: string;
  direction: string;
  eventType: RunEventType;
  payload: Record<string, unknown>;
  requestId: string;
  userId: string;
  sequence: number;
}

export interface RunEventPublisher {
  driverName(): string;
  publish(input: PublishRunEventInput): Promise<RunEvent>;
}

export const RUN_EVENT_PUBLISHER = Symbol('RUN_EVENT_PUBLISHER');
