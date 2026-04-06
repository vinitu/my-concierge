import { Injectable, Logger } from "@nestjs/common";
import type {
  AssistantLlmAvailableTool,
  AssistantLlmConfig,
  AssistantLlmConversationRespondResponse,
  AssistantLlmModelCatalogEntry,
  AssistantLlmMessage,
  AssistantLlmOllamaModelDownloadResponse,
  AssistantLlmProvider,
  AssistantLlmProviderStatus,
} from "../contracts/assistant-llm";
import { STATIC_PROVIDER_MODELS } from "../contracts/assistant-llm-model-catalog";
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

  async models(): Promise<Record<AssistantLlmProvider, AssistantLlmModelCatalogEntry[]>> {
    const config = await this.assistantLlmConfigService.read();
    return {
      deepseek: this.buildStaticModelCatalog(
        STATIC_PROVIDER_MODELS.deepseek,
        Boolean(config.deepseek_api_key.trim()),
      ),
      ollama: this.buildOllamaModelCatalog(
        STATIC_PROVIDER_MODELS.ollama,
      ),
      xai: this.buildStaticModelCatalog(
        STATIC_PROVIDER_MODELS.xai,
        Boolean(config.xai_api_key.trim()),
      ),
    };
  }

  async downloadOllamaModel(model: string): Promise<AssistantLlmOllamaModelDownloadResponse> {
    const normalizedModel = typeof model === "string" ? model.trim() : "";
    if (!STATIC_PROVIDER_MODELS.ollama.includes(normalizedModel)) {
      throw new Error(`Unsupported Ollama model: ${normalizedModel || "unknown"}`);
    }

    const enabled = new Set(this.ollamaProviderStatusService.getEnabledModelsSnapshot());
    if (!enabled.has(normalizedModel)) {
      await this.ollamaProviderStatusService.downloadModel(normalizedModel);
    }

    const refreshed = new Set(this.ollamaProviderStatusService.getEnabledModelsSnapshot());
    return {
      enabled: refreshed.has(normalizedModel),
      model: normalizedModel,
      provider: "ollama",
      status: refreshed.has(normalizedModel)
        ? "ok"
        : "Model is not available locally",
    };
  }

  async generateMain(
    messages: AssistantLlmMessage[],
    tools?: AssistantLlmAvailableTool[],
  ): Promise<string> {
    const config = await this.assistantLlmConfigService.read();
    return this.selectTextProvider(config).generateFromMessages(messages, tools);
  }

  async generateConversationResponse(
    messages: AssistantLlmMessage[],
    tools?: AssistantLlmAvailableTool[],
  ): Promise<AssistantLlmConversationRespondResponse> {
    const config = await this.assistantLlmConfigService.read();
    const provider = this.selectTextProvider(config);
    let responseText = await provider.generateFromMessages(messages, tools);
    let normalized = this.normalizeConversationResponse(responseText);

    for (
      let attempt = 0;
      !normalized && attempt < config.response_repair_attempts;
      attempt += 1
    ) {
      this.logger.warn(
        `conversation-repair attempt=${String(attempt + 1)} model=${config.model} provider=${config.provider}`,
      );
      responseText = await provider.generateFromMessages(
        this.buildResponseRepairMessages(responseText, messages, tools),
      );
      normalized = this.normalizeConversationResponse(responseText);
    }

    if (normalized) {
      return normalized;
    }

    const message = responseText.trim();
    return {
      message: message.length > 0 ? message : "No response from model",
      type: "final",
    };
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

  private buildStaticModelCatalog(
    models: string[],
    enabled: boolean,
  ): AssistantLlmModelCatalogEntry[] {
    const status = enabled ? null : "API key is missing";
    return [...new Set(models)].map((name) => ({
      enabled,
      name,
      status,
    }));
  }

  private buildOllamaModelCatalog(
    models: string[],
  ): AssistantLlmModelCatalogEntry[] {
    const enabled = new Set(this.ollamaProviderStatusService.getEnabledModelsSnapshot());
    return [...new Set(models)].map((name) => ({
      enabled: enabled.has(name),
      name,
      status: enabled.has(name) ? null : "Model is not available locally",
    }));
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

  private buildResponseRepairMessages(
    malformedOutput: string,
    messages: AssistantLlmMessage[],
    tools?: AssistantLlmAvailableTool[],
  ): AssistantLlmMessage[] {
    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");
    const allowedToolNames = Array.from(
      new Set(
        (tools ?? [])
          .map((tool) => (typeof tool.name === "string" ? tool.name.trim() : ""))
          .filter((name) => name.length > 0),
      ),
    );

    const repairPrompt = [
      "Repair the malformed assistant response into valid JSON.",
      "Do not explain the error and do not add markdown fences.",
      "Return one JSON object only.",
      'Required shape: {"type":"final|tool_call|error","message":"...","tool_name":"optional","tool_arguments":{},"context":"...","memory_writes":[],"tool_observations":[]}.',
      "If the malformed response clearly intended a tool call, return type=tool_call.",
      "If it clearly intended a final or error response, preserve that intent.",
      "Use only allowed tool names when returning type=tool_call.",
      `Allowed tool names: ${allowedToolNames.length > 0 ? allowedToolNames.join(", ") : "(none)"}.`,
      "Use the malformed response as the primary source of truth.",
      "Use the latest user message only as minimal context when the malformed response is incomplete.",
    ].join("\n");

    return [
      { content: repairPrompt, role: "system" },
      {
        content: [
          "Malformed assistant response:",
          malformedOutput.trim() || "(empty)",
          "",
          "Latest user message:",
          latestUserMessage?.content?.trim() || "(none)",
        ].join("\n"),
        role: "user",
      },
    ];
  }

  private normalizeConversationResponse(
    responseText: string,
  ): AssistantLlmConversationRespondResponse | null {
    const parsed = this.extractJsonObject(responseText);
    const normalized = this.normalizePlanningLikeObject(parsed);
    if (normalized) {
      return normalized;
    }

    return null;
  }

  private extractJsonObject(value: string): Record<string, unknown> | null {
    const trimmed = value.trim();
    const unwrapped =
      trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] ?? trimmed;
    const start = unwrapped.indexOf("{");
    const end = unwrapped.lastIndexOf("}");
    const candidate =
      start >= 0 && end >= start ? unwrapped.slice(start, end + 1) : unwrapped;

    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }

  private normalizePlanningLikeObject(
    parsed: Record<string, unknown> | null,
  ): AssistantLlmConversationRespondResponse | null {
    if (!parsed) {
      return null;
    }

    const typeRaw = parsed.type;
    if (
      (typeRaw === "final" || typeRaw === "tool_call" || typeRaw === "error") &&
      (typeof parsed.message === "string" || typeRaw === "tool_call")
    ) {
      return {
        context: typeof parsed.context === "string" ? parsed.context : undefined,
        memory_writes: Array.isArray(parsed.memory_writes)
          ? (parsed.memory_writes as Record<string, unknown>[])
          : undefined,
        message:
          typeof parsed.message === "string"
            ? parsed.message
            : typeRaw === "tool_call"
              ? ""
              : "No response from model",
        tool_arguments:
          typeof parsed.tool_arguments === "object" &&
          parsed.tool_arguments !== null &&
          !Array.isArray(parsed.tool_arguments)
            ? (parsed.tool_arguments as Record<string, unknown>)
            : undefined,
        tool_name: typeof parsed.tool_name === "string" ? parsed.tool_name : undefined,
        tool_observations: Array.isArray(parsed.tool_observations)
          ? (parsed.tool_observations as Record<string, unknown>[])
          : undefined,
        type: typeRaw,
      };
    }

    if (typeof parsed.name === "string" && parsed.name.trim().length > 0) {
      return {
        message: "",
        tool_arguments:
          typeof parsed.arguments === "object" &&
          parsed.arguments !== null &&
          !Array.isArray(parsed.arguments)
            ? (parsed.arguments as Record<string, unknown>)
            : {},
        tool_name: parsed.name,
        type: "tool_call",
      };
    }

    const messageCandidates = [
      parsed.message,
      parsed.response,
      parsed.reply,
      parsed.answer,
      parsed.text,
      parsed.content,
    ];
    const directMessage =
      messageCandidates.find(
        (entry): entry is string =>
          typeof entry === "string" && entry.trim().length > 0,
      ) ?? null;
    if (directMessage) {
      return {
        context: typeof parsed.context === "string" ? parsed.context : undefined,
        memory_writes: Array.isArray(parsed.memory_writes)
          ? (parsed.memory_writes as Record<string, unknown>[])
          : undefined,
        message: directMessage.trim(),
        tool_observations: Array.isArray(parsed.tool_observations)
          ? (parsed.tool_observations as Record<string, unknown>[])
          : undefined,
        type: "final",
      };
    }

    const finalRaw = parsed.final;
    if (typeof finalRaw === "object" && finalRaw !== null && !Array.isArray(finalRaw)) {
      const final = finalRaw as Record<string, unknown>;
      const nestedMessageCandidates = [
        final.message,
        final.response,
        final.reply,
        final.answer,
        final.text,
        final.content,
      ];
      const message =
        nestedMessageCandidates.find((entry): entry is string => typeof entry === "string") ??
        "No response from model";
      return {
        context: typeof final.context === "string" ? final.context : undefined,
        memory_writes: Array.isArray(final.memory_writes)
          ? (final.memory_writes as Record<string, unknown>[])
          : undefined,
        message,
        tool_observations: Array.isArray(final.tool_observations)
          ? (final.tool_observations as Record<string, unknown>[])
          : undefined,
        type: "final",
      };
    }

    const toolCallRaw = parsed.tool_call;
    if (
      typeof toolCallRaw === "object" &&
      toolCallRaw !== null &&
      !Array.isArray(toolCallRaw)
    ) {
      const toolCall = toolCallRaw as Record<string, unknown>;
      return {
        message: "",
        tool_arguments:
          typeof toolCall.arguments === "object" &&
          toolCall.arguments !== null &&
          !Array.isArray(toolCall.arguments)
            ? (toolCall.arguments as Record<string, unknown>)
            : {},
        tool_name: typeof toolCall.name === "string" ? toolCall.name : undefined,
        type: "tool_call",
      };
    }

    return null;
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
