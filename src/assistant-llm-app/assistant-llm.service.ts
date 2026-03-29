import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import type {
  AssistantLlmConfig,
  AssistantMemoryExtractKind,
  AssistantLlmExtractMemoryResponse,
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

const memoryExtractSchema = z.object({
  profile_patch: z
    .object({
      constraints: z.record(z.string(), z.unknown()).optional(),
      home: z.record(z.string(), z.unknown()).optional(),
      language: z.string().nullable().optional(),
      preferences: z.record(z.string(), z.unknown()).optional(),
      timezone: z.string().nullable().optional(),
    })
    .default({}),
  typed_writes: z.object({
    episode: z
      .array(
        z.object({
          confidence: z.number().min(0).max(1),
          content: z.string().min(1),
          conversationThreadId: z.string().optional(),
          scope: z.string().min(1),
          source: z.string().min(1),
          tags: z.array(z.string()).optional(),
        }),
      )
      .default([]),
    fact: z
      .array(
        z.object({
          confidence: z.number().min(0).max(1),
          content: z.string().min(1),
          conversationThreadId: z.string().optional(),
          scope: z.string().min(1),
          source: z.string().min(1),
          tags: z.array(z.string()).optional(),
        }),
      )
      .default([]),
    preference: z
      .array(
        z.object({
          confidence: z.number().min(0).max(1),
          content: z.string().min(1),
          conversationThreadId: z.string().optional(),
          scope: z.string().min(1),
          source: z.string().min(1),
          tags: z.array(z.string()).optional(),
        }),
      )
      .default([]),
    project: z
      .array(
        z.object({
          confidence: z.number().min(0).max(1),
          content: z.string().min(1),
          conversationThreadId: z.string().optional(),
          scope: z.string().min(1),
          source: z.string().min(1),
          tags: z.array(z.string()).optional(),
        }),
      )
      .default([]),
    routine: z
      .array(
        z.object({
          confidence: z.number().min(0).max(1),
          content: z.string().min(1),
          conversationThreadId: z.string().optional(),
          scope: z.string().min(1),
          source: z.string().min(1),
          tags: z.array(z.string()).optional(),
        }),
      )
      .default([]),
    rule: z
      .array(
        z.object({
          confidence: z.number().min(0).max(1),
          content: z.string().min(1),
          conversationThreadId: z.string().optional(),
          scope: z.string().min(1),
          source: z.string().min(1),
          tags: z.array(z.string()).optional(),
        }),
      )
      .default([]),
  }),
});

const EXTRACT_INSTRUCTIONS: Record<AssistantMemoryExtractKind, string[]> = {
  profile: [
    "Extract only canonical profile patch data.",
    "Allowed profile_patch keys: language, timezone, home, preferences, constraints.",
    "Do not produce typed_writes for profile extract.",
    "Keep profile_patch minimal and durable; avoid temporary session details.",
  ],
  preference: [
    "Extract only durable user preferences.",
    "Write entries only to typed_writes.preference.",
    "Do not produce profile_patch or other typed_writes kinds.",
    "Preference examples: language preference, style preference, recurring likes/dislikes.",
  ],
  fact: [
    "Extract only durable objective facts about the user/context.",
    "Write entries only to typed_writes.fact.",
    "Do not produce profile_patch or other typed_writes kinds.",
    "Prefer explicit facts stated by the user over assumptions.",
  ],
  routine: [
    "Extract only recurring routines or stable repeated patterns.",
    "Write entries only to typed_writes.routine.",
    "Do not produce profile_patch or other typed_writes kinds.",
    "Ignore one-off tasks that are not recurring.",
  ],
  project: [
    "Extract only active long-lived project context.",
    "Write entries only to typed_writes.project.",
    "Do not produce profile_patch or other typed_writes kinds.",
    "Prefer project goals, constraints, and stable decisions.",
  ],
  episode: [
    "Extract only important episodic events/decisions from the conversation.",
    "Write entries only to typed_writes.episode.",
    "Do not produce profile_patch or other typed_writes kinds.",
    "Capture what happened and why it matters later.",
  ],
  rule: [
    "Extract only explicit rules/instructions/constraints for assistant behavior.",
    "Write entries only to typed_writes.rule.",
    "Do not produce profile_patch or other typed_writes kinds.",
    "Prefer direct imperatives and stable constraints.",
  ],
};

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

  async generateMain(messages: AssistantLlmMessage[]): Promise<string> {
    const config = await this.assistantLlmConfigService.read();
    return this.selectTextProvider(config).generateFromMessages(messages);
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

  async extractMemory(
    conversationId: string,
    extract: AssistantMemoryExtractKind,
    messages: AssistantLlmMessage[],
  ): Promise<AssistantLlmExtractMemoryResponse> {
    const prompt = this.buildExtractPrompt(conversationId, extract);
    try {
      const response = await this.generateMain([
        { content: prompt, role: "system" },
        ...messages,
      ]);
      const parsed = this.parseJsonObject(response);
      const result = memoryExtractSchema.safeParse(parsed);

      if (!result.success) {
        this.logger.warn(
          `extract-memory parse fallback conversation_id=${conversationId} extract=${extract}: invalid JSON schema`,
        );
        return this.emptyExtractMemoryResponse();
      }

      return this.filterExtractResult(result.data, extract);
    } catch (error) {
      this.logger.warn(
        `extract-memory generation fallback conversation_id=${conversationId} extract=${extract}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return this.emptyExtractMemoryResponse();
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

  private parseJsonObject(text: string): unknown {
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

  private emptyExtractMemoryResponse(): AssistantLlmExtractMemoryResponse {
    return {
      profile_patch: {},
      typed_writes: {
        episode: [],
        fact: [],
        preference: [],
        project: [],
        routine: [],
        rule: [],
      },
    };
  }

  private filterExtractResult(
    value: AssistantLlmExtractMemoryResponse,
    extract: AssistantMemoryExtractKind,
  ): AssistantLlmExtractMemoryResponse {
    const empty = this.emptyExtractMemoryResponse();

    if (extract === "profile") {
      empty.profile_patch = value.profile_patch ?? {};
      return empty;
    }

    empty.typed_writes[extract] = value.typed_writes[extract] ?? [];
    return empty;
  }

  private buildExtractPrompt(
    conversationId: string,
    extract: AssistantMemoryExtractKind,
  ): string {
    return [
      "Extract durable memory from conversation.",
      `Extract type: ${extract}.`,
      ...EXTRACT_INSTRUCTIONS[extract],
      "Return JSON only with exact shape:",
      '{"profile_patch":{},"typed_writes":{"preference":[],"fact":[],"routine":[],"project":[],"episode":[],"rule":[]}}',
      "Only include stable information for the selected extract type.",
      "For non-selected extract types, return empty objects/arrays.",
      'Use source="assistant-memory-enrichment", scope="conversation", confidence in range 0.6-0.95.',
      `conversation_id=${conversationId}`,
    ].join("\n");
  }
}
