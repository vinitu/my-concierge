export interface ExecutionJob {
  chat: string;
  conversation_id: string;
  contact?: string;
  direction: string;
  user_id: string;
  message: string;
  accepted_at: string;
  request_id: string;
}

export type RunEventType =
  | "run.started"
  | "run.thinking"
  | "run.completed"
  | "run.failed"
  | `memory.${string}`;

export interface RunEvent {
  requestId: string;
  conversationId: string;
  direction: string;
  userId: string;
  channel: string;
  eventType: RunEventType;
  sequence: number;
  payload: Record<string, unknown>;
  createdAt: string;
}
