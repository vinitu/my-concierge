import type { AssistantMemoryExtractKind } from "./assistant-memory";

export type { AssistantMemoryExtractKind };

export type AssistantLlmProvider = "deepseek" | "ollama" | "xai";

export interface AssistantLlmMessage {
  content: string;
  role: "assistant" | "system" | "user";
}

export interface AssistantLlmAvailableTool {
  description: string;
  name: string;
  use_when?: string;
}

export interface AssistantLlmConfig {
  deepseek_api_key: string;
  deepseek_base_url: string;
  deepseek_timeout_ms: number;
  model: string;
  ollama_base_url: string;
  ollama_timeout_ms: number;
  provider: AssistantLlmProvider;
  response_repair_attempts: number;
  xai_api_key: string;
  xai_base_url: string;
  xai_timeout_ms: number;
}

export interface AssistantLlmProviderStatus {
  enabled: boolean;
  model: string;
  provider: AssistantLlmProvider;
  status: string;
}

export interface AssistantLlmModelCatalogEntry {
  enabled: boolean;
  name: string;
  status: string | null;
}

export interface AssistantLlmModelsResponse {
  models: Record<AssistantLlmProvider, AssistantLlmModelCatalogEntry[]>;
}

export interface AssistantLlmOllamaModelDownloadResponse {
  enabled: boolean;
  model: string;
  provider: "ollama";
  status: string;
}

export interface AssistantLlmMainGenerateRequest {
  tools?: AssistantLlmAvailableTool[];
  messages: AssistantLlmMessage[];
}

export interface AssistantLlmConversationRespondRequest {
  messages: AssistantLlmMessage[];
  tools?: AssistantLlmAvailableTool[];
}

export interface AssistantLlmConversationRespondResponse {
  context?: string;
  memory_writes?: Record<string, unknown>[];
  message: string;
  tool_arguments?: Record<string, unknown>;
  tool_name?: string;
  tool_observations?: Record<string, unknown>[];
  type: "error" | "final" | "tool_call";
}

export interface AssistantLlmSummarizeRequest {
  messages: AssistantLlmMessage[];
  previous_context: string;
}

export interface AssistantLlmSummarizeResponse {
  summary: string;
}

export interface AssistantLlmMemoryByKindRequest {
  conversation_id?: string;
  messages: AssistantLlmMessage[];
}

export interface AssistantLlmMemoryFactResponse {
  items: string[];
}

export interface AssistantLlmMemoryProfileResponse {
  patch: {
    constraints?: Record<string, unknown>;
    home?: Record<string, unknown>;
    language?: string | null;
    preferences?: Record<string, unknown>;
    timezone?: string | null;
  };
}
