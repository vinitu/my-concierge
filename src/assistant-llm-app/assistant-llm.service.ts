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
    const prompt = this.buildFactsExtractPrompt(conversationId);
    try {
      const response = await this.generateMain([
        { content: prompt, role: "system" },
        ...messages,
      ]);
      const extracted = this.parseFactsFromResponse(response);
      this.logger.debug(
        `extract-facts conversation_id=${conversationId} items=${extracted.length}`,
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
      "Extract durable facts from conversation.",
      "Return JSON only with exact shape:",
      '{"items":["User ..."]}',
      "Rules:",
      "- Keep only stable facts.",
      "- Use third person for each item (for example: User lives in Warsaw.).",
      "- Do not include temporary or speculative details.",
      `conversation_id=${conversationId}`,
    ].join("\n");
  }

  private parseFactsFromResponse(responseText: string): string[] {
    const parsed = this.parseJsonCandidate(responseText);
    const fromObject = this.parseFactsFromObject(parsed);
    if (fromObject.length > 0) {
      return fromObject;
    }
    return this.extractFactsFromRawText(responseText);
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
