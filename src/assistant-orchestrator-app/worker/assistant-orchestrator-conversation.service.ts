import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  ConversationSearchResponse,
  ConversationState,
  ConversationThreadListResponse,
} from "../../contracts/assistant-memory";
import type { ExecutionJob } from "../../contracts/assistant-transport";
import type { AssistantLlmGenerateResult } from "./assistant-llm-output-schema";
import { AssistantOrchestratorConfigService } from "./assistant-orchestrator-config.service";

export interface AssistantConversationMessage {
  content: string;
  created_at: string;
  role: "assistant" | "user";
}

export interface AssistantConversationState {
  chat: string;
  user_id: string;
  context: string;
  direction: string;
  messages: AssistantConversationMessage[];
  updated_at: string | null;
}

export interface AssistantConversationSearchResult {
  messages: AssistantConversationMessage[];
  thread_id: string;
  summary: string;
}

export interface AssistantConversationThreadListItem {
  chat: string;
  user_id: string;
  direction: string;
  thread_id: string;
  updated_at: string | null;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

@Injectable()
export class AssistantOrchestratorConversationService {
  private readonly logger = new Logger(
    AssistantOrchestratorConversationService.name,
  );

  constructor(
    private readonly assistantOrchestratorConfigService: AssistantOrchestratorConfigService,
    private readonly configService: ConfigService,
  ) {}

  async read(message: ExecutionJob): Promise<AssistantConversationState> {
    this.logger.log(
      `Conversation read start conversationId=${message.conversation_id} via=assistant-memory`,
    );
    const userId = message.user_id?.trim() || message.contact?.trim() || "default-user";
    const maxMessages = await this.memoryWindow();
    const response = await this.fetchMemoryEndpoint("/v1/conversations/read", {
      chat: message.chat,
      user_id: userId,
      conversation_id: message.conversation_id,
      direction: message.direction,
      limit: maxMessages,
    });

    const payload = (await response.json()) as ConversationState;
    return payload;
  }

  async appendExchange(
    message: ExecutionJob,
    reply: AssistantLlmGenerateResult,
    requestId?: string,
  ): Promise<AssistantConversationState> {
    const userId = message.user_id?.trim() || message.contact?.trim() || "default-user";
    const response = await this.fetchMemoryEndpoint("/v1/conversations/append", {
      chat: message.chat,
      user_id: userId,
      conversation_id: message.conversation_id,
      direction: message.direction,
      message: message.message,
      reply: {
        message: reply.message,
      },
      request_id: requestId,
    });

    const payload = (await response.json()) as ConversationState;
    return payload;
  }

  async searchThread(
    conversationId: string,
    limit: number,
  ): Promise<AssistantConversationSearchResult> {
    const response = await this.fetchMemoryEndpoint("/v1/conversations/search", {
      conversation_id: conversationId,
      limit: Math.max(1, Math.min(20, Math.floor(limit))),
    });
    const payload = (await response.json()) as ConversationSearchResponse;
    return payload;
  }

  async listConversations(): Promise<AssistantConversationThreadListItem[]> {
    const baseUrl = this.baseUrl();
    const response = await fetch(`${baseUrl}/v1/conversations`);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `assistant-memory returned ${response.status} for /v1/conversations: ${body}`,
      );
    }

    const payload = (await response.json()) as ConversationThreadListResponse;
    return payload.threads;
  }

  private async memoryWindow(): Promise<number> {
    const config = await this.assistantOrchestratorConfigService.read();
    return config.memory_window;
  }

  private async fetchMemoryEndpoint(path: string, body: unknown): Promise<Response> {
    const response = await fetch(`${this.baseUrl()}${path}`, {
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(
        `assistant-memory returned ${response.status} for ${path}: ${responseBody}`,
      );
    }

    return response;
  }

  private baseUrl(): string {
    return trimTrailingSlash(
      this.configService.get<string>(
        "ASSISTANT_MEMORY_URL",
        "http://localhost:8086",
      ),
    );
  }
}
