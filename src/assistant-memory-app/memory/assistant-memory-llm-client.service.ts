import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  AssistantLlmMemoryFactResponse,
  AssistantLlmMemoryProfileResponse,
  AssistantLlmMessage,
} from "../../contracts/assistant-llm";

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

@Injectable()
export class AssistantMemoryLlmClientService {
  private readonly logger = new Logger(AssistantMemoryLlmClientService.name);

  constructor(private readonly configService: ConfigService) {}

  async extractFacts(
    conversationId: string,
    messages: AssistantLlmMessage[],
  ): Promise<string[]> {
    const endpoint = "/v1/memory/facts";
    this.logger.debug(
      `assistant-llm request endpoint=${endpoint} conversation_id=${conversationId} messages=${messages.length}`,
    );

    const response = await fetch(`${this.baseUrl()}${endpoint}`, {
      body: JSON.stringify({
        conversation_id: conversationId,
        messages,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(this.timeoutMs()),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `assistant-llm returned ${String(response.status)} for ${endpoint}: ${body}`,
      );
    }

    const payload = (await response.json()) as AssistantLlmMemoryFactResponse;
    const extracted = Array.isArray(payload.items)
      ? payload.items
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : [];
    this.logger.debug(
      `assistant-llm response endpoint=${endpoint} conversation_id=${conversationId} items=${extracted.length} payload=${JSON.stringify(
        payload,
      )}`,
    );
    return extracted;
  }

  async extractProfile(
    conversationId: string,
    messages: AssistantLlmMessage[],
  ): Promise<{
    constraints?: Record<string, unknown>;
    home?: Record<string, unknown>;
    language?: string | null;
    preferences?: Record<string, unknown>;
    timezone?: string | null;
  }> {
    const endpoint = "/v1/memory/profile";
    this.logger.debug(
      `assistant-llm request endpoint=${endpoint} conversation_id=${conversationId} messages=${messages.length}`,
    );

    const response = await fetch(`${this.baseUrl()}${endpoint}`, {
      body: JSON.stringify({
        conversation_id: conversationId,
        messages,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(this.timeoutMs()),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `assistant-llm returned ${String(response.status)} for ${endpoint}: ${body}`,
      );
    }

    const payload = (await response.json()) as AssistantLlmMemoryProfileResponse;
    const patch =
      typeof payload.patch === "object" &&
      payload.patch !== null &&
      !Array.isArray(payload.patch)
        ? payload.patch
        : {};
    this.logger.debug(
      `assistant-llm response endpoint=${endpoint} conversation_id=${conversationId} fields=${Object.keys(
        patch,
      ).join(",") || "none"} payload=${JSON.stringify(payload)}`,
    );
    return patch;
  }

  private baseUrl(): string {
    return trimTrailingSlash(
      this.configService.get<string>(
        "ASSISTANT_LLM_URL",
        "http://assistant-llm:3000",
      ),
    );
  }

  private timeoutMs(): number {
    const raw = this.configService.get<string>(
      "ASSISTANT_MEMORY_ENRICHMENT_TIMEOUT_MS",
      "15000",
    );
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 15000;
    }
    return parsed;
  }
}
