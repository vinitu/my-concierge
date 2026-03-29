import type {
  AssistantMemoryExtractKind,
  BaseMemoryWriteCandidate,
  MemoryKind,
} from "./assistant-memory";

export type { AssistantMemoryExtractKind };

export type AssistantLlmProvider = "deepseek" | "ollama" | "xai";

export interface AssistantLlmMessage {
  content: string;
  role: "assistant" | "system" | "user";
}

export interface AssistantLlmConfig {
  deepseek_api_key: string;
  deepseek_base_url: string;
  deepseek_timeout_ms: number;
  model: string;
  ollama_base_url: string;
  ollama_timeout_ms: number;
  provider: AssistantLlmProvider;
  small_model_safe_mode: boolean;
  structured_mode: boolean;
  xai_api_key: string;
  xai_base_url: string;
  xai_timeout_ms: number;
}

export interface AssistantLlmProviderStatus {
  apiKeyConfigured: boolean | null;
  message: string;
  model: string;
  provider: AssistantLlmProvider;
  reachable: boolean;
  status: "error" | "missing_key" | "ready";
}

export interface AssistantLlmMainGenerateRequest {
  messages: AssistantLlmMessage[];
}

export interface AssistantLlmMainGenerateResponse {
  text: string;
}

export interface AssistantLlmSummarizeRequest {
  messages: AssistantLlmMessage[];
  previous_context: string;
}

export interface AssistantLlmSummarizeResponse {
  summary: string;
}

export interface AssistantLlmExtractMemoryRequest {
  conversation_id: string;
  extract: AssistantMemoryExtractKind;
  messages: AssistantLlmMessage[];
}

export interface AssistantLlmExtractMemoryResponse {
  profile_patch: {
    constraints?: Record<string, unknown>;
    home?: Record<string, unknown>;
    language?: string | null;
    preferences?: Record<string, unknown>;
    timezone?: string | null;
  };
  typed_writes: {
    episode: Array<BaseMemoryWriteCandidate & { kind?: MemoryKind }>;
    fact: Array<BaseMemoryWriteCandidate & { kind?: MemoryKind }>;
    preference: Array<BaseMemoryWriteCandidate & { kind?: MemoryKind }>;
    project: Array<BaseMemoryWriteCandidate & { kind?: MemoryKind }>;
    routine: Array<BaseMemoryWriteCandidate & { kind?: MemoryKind }>;
    rule: Array<BaseMemoryWriteCandidate & { kind?: MemoryKind }>;
  };
}
