import { AssistantToolCatalogService } from "./assistant-tool-catalog.service";
import { AssistantOrchestratorPromptService } from "./assistant-orchestrator-prompt.service";
import { AssistantOrchestratorPromptTemplateService } from "./assistant-orchestrator-prompt-template.service";
import type { AssistantOrchestratorRuntimeContext } from "./assistant-orchestrator-runtime-context.service";

describe("AssistantOrchestratorPromptTemplateService", () => {
  const runtimeContext: AssistantOrchestratorRuntimeContext = {
    agents: '["agent rules"]',
    datadir: "/runtime",
    identity: null,
    memory: [
      {
        content: "remember this",
        path: "memory/profile.md",
      },
    ],
    soul: null,
  };

  it("renders planning prompt with request payload and structured format instructions", async () => {
    const service = new AssistantOrchestratorPromptTemplateService(
      new AssistantOrchestratorPromptService(new AssistantToolCatalogService()),
    );

    await expect(
      service.renderPlanningPrompt(
        {
          conversation: {
            chat: "direct",
            user_id: "alex",
            context: "Current conversation context",
            direction: "api",
            messages: [
              {
                content: "hello",
                created_at: "2026-03-22T10:00:00.000Z",
                role: "user",
              },
            ],
            updated_at: null,
          },
          message: {
            accepted_at: new Date().toISOString(),
            chat: "direct",
            conversation_id: "alex",

            user_id: "alex",

            direction: "api",
            message: "current message",
            request_id: "req-1",
          },
          retrieved_memory: [],
        },
        runtimeContext,
      ),
    ).resolves.toContain('"system_instructions": [');
    await expect(
      service.renderPlanningPrompt(
        {
          conversation: {
            chat: "direct",
            user_id: "alex",
            context: "Current conversation context",
            direction: "api",
            messages: [],
            updated_at: null,
          },
          message: {
            accepted_at: new Date().toISOString(),
            chat: "direct",
            conversation_id: "alex",

            user_id: "alex",

            direction: "api",
            message: "current message",
            request_id: "req-1",
          },
          retrieved_memory: [],
        },
        runtimeContext,
      ),
    ).resolves.toContain(
      "You are the assistant runtime agent loop.",
    );
  });
});
