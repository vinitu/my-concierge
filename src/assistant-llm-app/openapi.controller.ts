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
        "/v1/conversation/respond": {
          post: {
            summary: "Generate structured conversation response from messages and tools",
          },
        },
        "/v1/conversation/summarize": {
          post: {
            summary: "Generate compact summary for conversation context",
          },
        },
        "/v1/memory/facts": {
          post: {
            summary: "Extract fact candidates from conversation messages",
          },
        },
      },
    };
  }
}
