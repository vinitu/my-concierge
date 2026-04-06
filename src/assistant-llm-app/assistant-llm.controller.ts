import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  ServiceUnavailableException,
} from "@nestjs/common";
import type {
  AssistantLlmConfig,
  AssistantLlmConversationRespondRequest,
  AssistantLlmConversationRespondResponse,
  AssistantLlmMemoryByKindRequest,
  AssistantLlmMemoryFactResponse,
  AssistantLlmModelsResponse,
  AssistantLlmMemoryProfileResponse,
  AssistantLlmOllamaModelDownloadResponse,
  AssistantLlmProvider,
  AssistantLlmProviderStatus,
  AssistantLlmSummarizeRequest,
  AssistantLlmSummarizeResponse,
} from "../contracts/assistant-llm";
import { defaultModelForProvider } from "../contracts/assistant-llm-model-catalog";
import { AssistantLlmService } from "./assistant-llm.service";

interface UpdateLlmConfigBody {
  deepseek_api_key?: string;
  deepseek_base_url?: string;
  deepseek_timeout_ms?: number | string;
  model?: string;
  ollama_base_url?: string;
  ollama_timeout_ms?: number | string;
  provider?: AssistantLlmProvider | string;
  response_repair_attempts?: number | string;
  xai_api_key?: string;
  xai_base_url?: string;
  xai_timeout_ms?: number | string;
}

@Controller()
export class AssistantLlmController {
  constructor(private readonly assistantLlmService: AssistantLlmService) {}

  @Get("config")
  getConfig(): Promise<AssistantLlmConfig> {
    return this.assistantLlmService.readConfig();
  }

  @Put("config")
  async updateConfig(
    @Body() body: UpdateLlmConfigBody,
  ): Promise<AssistantLlmConfig> {
    const provider = this.normalizeProvider(body.provider);

    return this.assistantLlmService.writeConfig({
      deepseek_api_key:
        typeof body.deepseek_api_key === "string" ? body.deepseek_api_key : "",
      deepseek_base_url:
        typeof body.deepseek_base_url === "string"
          ? body.deepseek_base_url
          : "",
      deepseek_timeout_ms:
        typeof body.deepseek_timeout_ms === "number"
          ? body.deepseek_timeout_ms
          : typeof body.deepseek_timeout_ms === "string"
            ? Number.parseInt(body.deepseek_timeout_ms, 10)
            : 360000,
      model:
        typeof body.model === "string" && body.model.trim()
          ? body.model.trim()
          : defaultModelForProvider(provider),
      ollama_base_url:
        typeof body.ollama_base_url === "string" ? body.ollama_base_url : "",
      ollama_timeout_ms:
        typeof body.ollama_timeout_ms === "number"
          ? body.ollama_timeout_ms
          : typeof body.ollama_timeout_ms === "string"
            ? Number.parseInt(body.ollama_timeout_ms, 10)
            : 360000,
      provider,
      response_repair_attempts:
        typeof body.response_repair_attempts === "number"
          ? body.response_repair_attempts
          : typeof body.response_repair_attempts === "string"
            ? Number.parseInt(body.response_repair_attempts, 10)
            : 1,
      xai_api_key: typeof body.xai_api_key === "string" ? body.xai_api_key : "",
      xai_base_url:
        typeof body.xai_base_url === "string" ? body.xai_base_url : "",
      xai_timeout_ms:
        typeof body.xai_timeout_ms === "number"
          ? body.xai_timeout_ms
          : typeof body.xai_timeout_ms === "string"
            ? Number.parseInt(body.xai_timeout_ms, 10)
            : 360000,
    });
  }

  @Get("provider")
  getProviderStatus(): Promise<AssistantLlmProviderStatus> {
    return this.assistantLlmService.providerStatus();
  }

  @Get("models")
  async getModels(): Promise<AssistantLlmModelsResponse> {
    return {
      models: await this.assistantLlmService.models(),
    };
  }

  @Post("models/ollama/:model/download")
  async downloadOllamaModel(
    @Param("model") model: string,
  ): Promise<AssistantLlmOllamaModelDownloadResponse> {
    try {
      return await this.assistantLlmService.downloadOllamaModel(model);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("Unsupported Ollama model:")) {
        throw new BadRequestException(message);
      }
      throw new ServiceUnavailableException(message);
    }
  }

  @Post("v1/conversation")
  async conversationRespond(
    @Body() body: AssistantLlmConversationRespondRequest,
  ): Promise<AssistantLlmConversationRespondResponse> {
    return this.assistantLlmService.generateConversationResponse(
      body.messages,
      body.tools,
    );
  }

  @Post("v1/conversation/summarize")
  async conversationSummarize(
    @Body() body: AssistantLlmSummarizeRequest,
  ): Promise<AssistantLlmSummarizeResponse> {
    return {
      summary: await this.assistantLlmService.summarize(
        body.messages,
        body.previous_context,
      ),
    };
  }

  @Post("v1/memory/facts")
  async extractFacts(
    @Body() body: AssistantLlmMemoryByKindRequest,
  ): Promise<AssistantLlmMemoryFactResponse> {
    const facts = await this.assistantLlmService.extractFacts(
      typeof body.conversation_id === "string" &&
        body.conversation_id.trim().length > 0
        ? body.conversation_id
        : "conversation_unknown",
      body.messages,
    );

    return {
      items: Array.from(
        new Set(
          facts
            .map((entry) => this.normalizeFactToThirdPerson(entry))
            .filter((entry) => entry.length > 0),
        ),
      ),
    };
  }

  @Post("v1/memory/profile")
  async extractProfile(
    @Body() body: AssistantLlmMemoryByKindRequest,
  ): Promise<AssistantLlmMemoryProfileResponse> {
    const patch = await this.assistantLlmService.extractProfile(
      typeof body.conversation_id === "string" &&
        body.conversation_id.trim().length > 0
        ? body.conversation_id
        : "conversation_unknown",
      body.messages,
    );

    return { patch };
  }

  private normalizeProvider(
    value: AssistantLlmProvider | string | undefined,
  ): AssistantLlmProvider {
    const normalized = value?.trim().toLowerCase();
    if (
      normalized === "deepseek" ||
      normalized === "ollama" ||
      normalized === "xai"
    ) {
      return normalized;
    }
    return "ollama";
  }
  private normalizeFactToThirdPerson(content: string): string {
    const trimmed = content.trim();
    if (!trimmed) {
      return "";
    }

    if (/^user\b/i.test(trimmed)) {
      return this.ensureSentence(trimmed);
    }

    const lowered = trimmed.toLowerCase();
    if (lowered.startsWith("my name is ")) {
      return this.ensureSentence(`User name is ${trimmed.slice(11).trim()}`);
    }
    if (lowered.startsWith("i am ")) {
      return this.ensureSentence(`User is ${trimmed.slice(5).trim()}`);
    }
    if (lowered.startsWith("i'm ")) {
      return this.ensureSentence(`User is ${trimmed.slice(4).trim()}`);
    }
    if (lowered.startsWith("i live in ")) {
      return this.ensureSentence(`User lives in ${trimmed.slice(10).trim()}`);
    }

    return this.ensureSentence(`User ${trimmed}`);
  }

  private ensureSentence(value: string): string {
    const normalized = value.trim();
    if (!normalized) {
      return "";
    }
    if (/[.!?]$/.test(normalized)) {
      return normalized;
    }
    return `${normalized}.`;
  }
}
