import { AssistantLlmController } from "./assistant-llm.controller";
import { AssistantLlmService } from "./assistant-llm.service";

describe("AssistantLlmController", () => {
  it("extracts profile patch via assistant-llm service", async () => {
    const extractProfile = jest.fn().mockResolvedValue({
      language: "ru",
      preferences: {
        reply_language: "ru",
      },
    });
    const controller = new AssistantLlmController({
      extractProfile,
    } as unknown as AssistantLlmService);

    await expect(
      controller.extractProfile({
        conversation_id: "conv-123",
        messages: [{ content: "отвечай на русском", role: "user" }],
      }),
    ).resolves.toEqual({
      patch: {
        language: "ru",
        preferences: {
          reply_language: "ru",
        },
      },
    });
    expect(extractProfile).toHaveBeenCalledWith("conv-123", [
      { content: "отвечай на русском", role: "user" },
    ]);
  });

  it("uses fallback conversation id when conversation_id is empty", async () => {
    const extractProfile = jest.fn().mockResolvedValue({});
    const controller = new AssistantLlmController({
      extractProfile,
    } as unknown as AssistantLlmService);

    await controller.extractProfile({
      conversation_id: "  ",
      messages: [{ content: "hi", role: "user" }],
    });

    expect(extractProfile).toHaveBeenCalledWith("conversation_unknown", [
      { content: "hi", role: "user" },
    ]);
  });
});
