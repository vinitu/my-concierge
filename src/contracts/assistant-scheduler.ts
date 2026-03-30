export interface AssistantSchedulerJob {
  id: string;
  name: string;
  direction: string;
  chat: string;
  user_id: string;
  conversation_id: string;
  message: string;
  every_seconds: number;
  enabled: boolean;
  next_run_at: string;
  last_run_at: string | null;
  last_request_id: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssistantSchedulerJobCreateRequest {
  name: string;
  direction: string;
  chat: string;
  user_id: string;
  conversation_id: string;
  message: string;
  every_seconds: number;
  enabled?: boolean;
}

export interface AssistantSchedulerJobUpdateRequest {
  name?: string;
  direction?: string;
  chat?: string;
  user_id?: string;
  conversation_id?: string;
  message?: string;
  every_seconds?: number;
  enabled?: boolean;
}

export interface AssistantSchedulerConfig {
  assistant_api_url: string;
  poll_interval_ms: number;
}

export interface UpdateAssistantSchedulerConfigBody {
  poll_interval_ms?: number;
}
