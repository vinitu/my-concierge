export interface CallbackRouting {
  base_url: string;
}

export interface ExecutionJob {
  chat: string;
  conversation_id: string;
  contact: string;
  direction: string;
  message: string;
  callback: CallbackRouting;
  accepted_at: string;
  request_id: string;
}

export type RunEventType =
  | 'run.started'
  | 'run.thinking'
  | 'run.completed'
  | 'run.failed';

export interface RunEvent {
  runId: string;
  requestId: string;
  conversationId: string;
  channel: string;
  eventType: RunEventType;
  sequence: number;
  payload: Record<string, unknown>;
  createdAt: string;
  callback: CallbackRouting;
}
