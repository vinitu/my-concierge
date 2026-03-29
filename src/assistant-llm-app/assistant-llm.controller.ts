import { Body, Controller, Get, Post, Put } from "@nestjs/common";
import type {
  AssistantLlmConfig,
  AssistantLlmExtractMemoryRequest,
  AssistantLlmExtractMemoryResponse,
  AssistantLlmMainGenerateRequest,
  AssistantLlmMainGenerateResponse,
  AssistantLlmProvider,
  AssistantLlmProviderStatus,
  AssistantLlmSummarizeRequest,
  AssistantLlmSummarizeResponse,
} from "../contracts/assistant-llm";
import { AssistantLlmService } from "./assistant-llm.service";
import { defaultModelForProvider } from "./assistant-llm-model-catalog";

interface UpdateLlmConfigBody {
  deepseek_api_key?: string;
  deepseek_base_url?: string;
  deepseek_timeout_ms?: number | string;
  model?: string;
  ollama_base_url?: string;
  ollama_timeout_ms?: number | string;
  provider?: AssistantLlmProvider | string;
  small_model_safe_mode?: boolean | string | number;
  structured_mode?: boolean | string | number;
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
      small_model_safe_mode: this.normalizeBoolean(
        body.small_model_safe_mode,
        false,
      ),
      structured_mode: this.normalizeBoolean(body.structured_mode, true),
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

  @Get("provider-status")
  getProviderStatus(): Promise<AssistantLlmProviderStatus> {
    return this.assistantLlmService.providerStatus();
  }

  @Get("models")
  async getModels(): Promise<{
    models: Record<AssistantLlmProvider, string[]>;
  }> {
    return {
      models: await this.assistantLlmService.models(),
    };
  }

  @Post("v1/generate/main")
  async generateMain(
    @Body() body: AssistantLlmMainGenerateRequest,
  ): Promise<AssistantLlmMainGenerateResponse> {
    return {
      text: await this.assistantLlmService.generateMain(body.messages),
    };
  }

  @Post("v1/generate/summarize")
  async generateSummarize(
    @Body() body: AssistantLlmSummarizeRequest,
  ): Promise<AssistantLlmSummarizeResponse> {
    return {
      summary: await this.assistantLlmService.summarize(
        body.messages,
        body.previous_context,
      ),
    };
  }

  @Post("v1/generate/extract-memory")
  generateExtractMemory(
    @Body() body: AssistantLlmExtractMemoryRequest,
  ): Promise<AssistantLlmExtractMemoryResponse> {
    return this.assistantLlmService.extractMemory(
      body.conversation_id,
      body.extract,
      body.messages,
    );
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

  private normalizeBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      return value !== 0;
    }
    if (typeof value === "string" && value.trim()) {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(normalized)) {
        return true;
      }
      if (["false", "0", "no", "off"].includes(normalized)) {
        return false;
      }
    }
    return fallback;
  }
}
