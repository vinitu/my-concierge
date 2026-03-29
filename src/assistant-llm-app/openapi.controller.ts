import { Controller, Get } from "@nestjs/common";

@Controller()
export class AssistantLlmOpenApiController {
  @Get("openapi.json")
  getOpenApi(): Record<string, unknown> {
    return {
      openapi: "3.1.0",
      info: {
        title: "assistant-llm",
        version: "1.0.0",
      },
      paths: {
        "/config": {
          get: {
            summary: "Read LLM config",
          },
          put: {
            summary: "Update LLM config",
          },
        },
        "/provider-status": {
          get: {
            summary: "Provider health and credentials status",
          },
        },
        "/models": {
          get: {
            summary: "List provider models",
          },
        },
        "/v1/generate/main": {
          post: {
            summary: "Generate main response from messages",
          },
        },
        "/v1/generate/summarize": {
          post: {
            summary: "Generate compact summary for conversation context",
          },
        },
        "/v1/generate/extract-memory": {
          post: {
            summary:
              "Extract one configured memory domain (profile or one typed kind)",
          },
        },
      },
    };
  }
}
