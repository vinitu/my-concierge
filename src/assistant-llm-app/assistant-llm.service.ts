import { Injectable, Logger } from "@nestjs/common";
import type {
  AssistantLlmAvailableTool,
  AssistantLlmConfig,
  AssistantLlmMessage,
  AssistantLlmProvider,
  AssistantLlmProviderStatus,
} from "../contracts/assistant-llm";
import {
  defaultModelForProvider,
  STATIC_PROVIDER_MODELS,
} from "./assistant-llm-model-catalog";
import { AssistantLlmConfigService } from "./assistant-llm-config.service";
import { DeepseekChatService } from "./deepseek-chat.service";
import { DeepseekProviderStatusService } from "./deepseek-provider-status.service";
import { GrokResponsesService } from "./grok-responses.service";
import { OllamaChatService } from "./ollama-chat.service";
import { OllamaProviderStatusService } from "./ollama-provider-status.service";
import type { AssistantLlmProviderPort } from "./assistant-llm-provider-port";
import { XaiProviderStatusService } from "./xai-provider-status.service";

@Injectable()
export class AssistantLlmService {
  private readonly logger = new Logger(AssistantLlmService.name);

  constructor(
    private readonly assistantLlmConfigService: AssistantLlmConfigService,
    private readonly deepseekChatService: DeepseekChatService,
    private readonly grokResponsesService: GrokResponsesService,
    private readonly ollamaChatService: OllamaChatService,
    private readonly deepseekProviderStatusService: DeepseekProviderStatusService,
    private readonly ollamaProviderStatusService: OllamaProviderStatusService,
    private readonly xaiProviderStatusService: XaiProviderStatusService,
  ) {}

  readConfig(): Promise<AssistantLlmConfig> {
    return this.assistantLlmConfigService.read();
  }

  writeConfig(config: AssistantLlmConfig): Promise<AssistantLlmConfig> {
    return this.assistantLlmConfigService.write(config);
  }

  async providerStatus(): Promise<AssistantLlmProviderStatus> {
    const config = await this.assistantLlmConfigService.read();
    return this.selectStatusProvider(config.provider).getStatus();
  }

  async models(): Promise<Record<AssistantLlmProvider, string[]>> {
    const config = await this.assistantLlmConfigService.read();
    const ollamaModels =
      await this.ollamaProviderStatusService.listAvailableModels();
    return {
      deepseek: this.mergeModels(
        STATIC_PROVIDER_MODELS.deepseek,
        config,
        "deepseek",
      ),
      ollama: this.mergeModels(
        [...STATIC_PROVIDER_MODELS.ollama, ...ollamaModels],
        config,
        "ollama",
      ),
      xai: this.mergeModels(STATIC_PROVIDER_MODELS.xai, config, "xai"),
    };
  }

  async generateMain(
    messages: AssistantLlmMessage[],
    tools?: AssistantLlmAvailableTool[],
  ): Promise<string> {
    const config = await this.assistantLlmConfigService.read();
    return this.selectTextProvider(config).generateFromMessages(messages, tools);
  }

  async summarize(
    messages: AssistantLlmMessage[],
    previousContext: string,
  ): Promise<string> {
    const config = await this.assistantLlmConfigService.read();
    return this.selectTextProvider(config).summarizeConversation(
      messages,
      previousContext,
    );
  }

  async extractFacts(
    conversationId: string,
    messages: AssistantLlmMessage[],
  ): Promise<string[]> {
    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");
    if (!latestUserMessage) {
      this.logger.debug(
        `extract-facts conversation_id=${conversationId} items=0 reason=no_user_message`,
      );
      return [];
    }

    const prompt = this.buildFactsExtractPrompt(conversationId);
    try {
      const response = await this.generateMain([
        { content: prompt, role: "system" },
        latestUserMessage,
      ]);
      const extracted = this.parseFactsFromResponse(response);
      this.logger.debug(
        `extract-facts conversation_id=${conversationId} items=${extracted.length} source=latest_user_only`,
      );
      return extracted;
    } catch (error) {
      this.logger.warn(
        `extract-facts fallback conversation_id=${conversationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
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
    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");
    if (!latestUserMessage) {
      this.logger.debug(
        `extract-profile conversation_id=${conversationId} patch=empty reason=no_user_message`,
      );
      return {};
    }

    const prompt = this.buildProfileExtractPrompt(conversationId);
    try {
      const response = await this.generateMain([
        { content: prompt, role: "system" },
        latestUserMessage,
      ]);
      const patch = this.parseProfilePatchFromResponse(response);
      this.logger.debug(
        `extract-profile conversation_id=${conversationId} fields=${Object.keys(patch).join(",") || "none"} source=latest_user_only`,
      );
      return patch;
    } catch (error) {
      this.logger.warn(
        `extract-profile fallback conversation_id=${conversationId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {};
    }
  }

  private selectTextProvider(
    config: AssistantLlmConfig,
  ): AssistantLlmProviderPort {
    if (config.provider === "deepseek") {
      return this.deepseekChatService;
    }
    if (config.provider === "xai") {
      return this.grokResponsesService;
    }
    return this.ollamaChatService;
  }

  private selectStatusProvider(
    provider: AssistantLlmProvider,
  ):
    | DeepseekProviderStatusService
    | OllamaProviderStatusService
    | XaiProviderStatusService {
    if (provider === "deepseek") {
      return this.deepseekProviderStatusService;
    }
    if (provider === "xai") {
      return this.xaiProviderStatusService;
    }
    return this.ollamaProviderStatusService;
  }

  private mergeModels(
    models: string[],
    config: AssistantLlmConfig,
    provider: AssistantLlmProvider,
  ): string[] {
    const next = [...new Set(models)];
    if (config.provider === provider && !next.includes(config.model)) {
      next.unshift(config.model);
    }
    if (next.length === 0) {
      next.push(defaultModelForProvider(provider));
    }
    return next;
  }

  private buildFactsExtractPrompt(conversationId: string): string {
    return [
      "Extract only the latest stable user fact from the latest user message in the conversation.",
      "Return JSON only with exact shape:",
      '{"items":["User ..."]}',
      "Rules:",
      "- Return at most one item in items.",
      "- Keep only facts about the user.",
      "- Use third person for the item (for example: User lives in Warsaw.).",
      "- Ignore assistant messages and older user messages.",
      "- Do not include temporary or speculative details.",
      "- If no stable user fact is present in the latest user message, return {\"items\":[]}.",
      `conversation_id=${conversationId}`,
    ].join("\n");
  }

  private buildProfileExtractPrompt(conversationId: string): string {
    return [
      "Extract only profile updates from the latest user message in the conversation.",
      "Return JSON only with exact shape:",
      '{"patch":{"language":null,"timezone":null,"home":{},"preferences":{},"constraints":{}}}',
      "Rules:",
      "- Use only keys that are explicitly present in the latest user message.",
      "- Keep patch empty if there is no explicit profile update.",
      "- Ignore assistant messages and older user messages.",
      "- language must be a string or null.",
      "- timezone must be a string or null.",
      "- home, preferences, constraints must be JSON objects when present.",
      "- If no profile update is present, return {\"patch\":{}}.",
      `conversation_id=${conversationId}`,
    ].join("\n");
  }

  private parseFactsFromResponse(responseText: string): string[] {
    const parsed = this.parseJsonCandidate(responseText);
    if (this.hasExplicitFactItems(parsed)) {
      return this.parseFactsFromObject(parsed);
    }
    const fromRaw = this.extractFactsFromRawText(responseText);
    if (fromRaw.length > 0) {
      return fromRaw;
    }

    const trimmed = responseText.trim();
    if (trimmed.length > 0) {
      throw new Error("Invalid facts extraction response: expected JSON with items");
    }
    return [];
  }

  private parseProfilePatchFromResponse(responseText: string): {
    constraints?: Record<string, unknown>;
    home?: Record<string, unknown>;
    language?: string | null;
    preferences?: Record<string, unknown>;
    timezone?: string | null;
  } {
    const parsed = this.parseJsonCandidate(responseText);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      const trimmed = responseText.trim();
      if (!trimmed) {
        return {};
      }
      throw new Error(
        "Invalid profile extraction response: expected JSON object with patch",
      );
    }

    const payload = parsed as Record<string, unknown>;
    const patchRaw =
      typeof payload.patch === "object" && payload.patch !== null && !Array.isArray(payload.patch)
        ? (payload.patch as Record<string, unknown>)
        : payload;

    const normalized: {
      constraints?: Record<string, unknown>;
      home?: Record<string, unknown>;
      language?: string | null;
      preferences?: Record<string, unknown>;
      timezone?: string | null;
    } = {};

    if ("language" in patchRaw) {
      normalized.language =
        typeof patchRaw.language === "string" ? patchRaw.language : null;
    }
    if ("timezone" in patchRaw) {
      normalized.timezone =
        typeof patchRaw.timezone === "string" ? patchRaw.timezone : null;
    }
    if (
      "home" in patchRaw &&
      typeof patchRaw.home === "object" &&
      patchRaw.home !== null &&
      !Array.isArray(patchRaw.home)
    ) {
      normalized.home = patchRaw.home as Record<string, unknown>;
    }
    if (
      "preferences" in patchRaw &&
      typeof patchRaw.preferences === "object" &&
      patchRaw.preferences !== null &&
      !Array.isArray(patchRaw.preferences)
    ) {
      normalized.preferences = patchRaw.preferences as Record<string, unknown>;
    }
    if (
      "constraints" in patchRaw &&
      typeof patchRaw.constraints === "object" &&
      patchRaw.constraints !== null &&
      !Array.isArray(patchRaw.constraints)
    ) {
      normalized.constraints = patchRaw.constraints as Record<string, unknown>;
    }

    return normalized;
  }

  private hasExplicitFactItems(value: unknown): boolean {
    if (Array.isArray(value)) {
      return true;
    }
    if (typeof value !== "object" || value === null) {
      return false;
    }

    const payload = value as Record<string, unknown>;
    if (Array.isArray(payload.items) || Array.isArray(payload.facts)) {
      return true;
    }
    const typedWrites =
      typeof payload.typed_writes === "object" && payload.typed_writes !== null
        ? (payload.typed_writes as Record<string, unknown>)
        : null;
    return Boolean(typedWrites && Array.isArray(typedWrites.fact));
  }

  private parseJsonCandidate(text: string): unknown {
    const trimmed = text.trim();
    const unwrapped =
      trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] ?? trimmed;
    const start = unwrapped.indexOf("{");
    const end = unwrapped.lastIndexOf("}");
    const candidate =
      start >= 0 && end >= start ? unwrapped.slice(start, end + 1) : unwrapped;
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  private parseFactsFromObject(value: unknown): string[] {
    if (Array.isArray(value)) {
      return this.normalizeFactItems(value);
    }
    if (typeof value !== "object" || value === null) {
      return [];
    }

    const payload = value as Record<string, unknown>;
    if (Array.isArray(payload.items)) {
      return this.normalizeFactItems(payload.items);
    }
    if (Array.isArray(payload.facts)) {
      return this.normalizeFactItems(payload.facts);
    }

    const typedWrites =
      typeof payload.typed_writes === "object" && payload.typed_writes !== null
        ? (payload.typed_writes as Record<string, unknown>)
        : null;
    if (typedWrites && Array.isArray(typedWrites.fact)) {
      return this.normalizeFactItems(typedWrites.fact);
    }
    return [];
  }

  private normalizeFactItems(items: unknown[]): string[] {
    const normalized = items
      .map((item) => {
        if (typeof item === "string") {
          return item.trim();
        }
        if (typeof item === "object" && item !== null) {
          const value = item as Record<string, unknown>;
          if (typeof value.content === "string") {
            return value.content.trim();
          }
          if (typeof value.text === "string") {
            return value.text.trim();
          }
          if (typeof value.value === "string") {
            return value.value.trim();
          }
        }
        return "";
      })
      .filter((entry) => entry.length > 0);

    return Array.from(new Set(normalized));
  }

  private extractFactsFromRawText(rawResponse: string): string[] {
    const matcher = /"(?:content|text|value|item)"\s*:\s*"([^"]+)"/g;
    const items: string[] = [];
    let next = matcher.exec(rawResponse);
    while (next) {
      const value = next[1]?.trim();
      if (value) {
        items.push(value);
      }
      next = matcher.exec(rawResponse);
    }
    return Array.from(new Set(items));
  }
}
