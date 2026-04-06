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

  it("downloads one Ollama model via assistant-llm service", async () => {
    const downloadOllamaModel = jest.fn().mockResolvedValue({
      enabled: true,
      model: "qwen3:1.7b",
      provider: "ollama",
      status: "ok",
    });
    const controller = new AssistantLlmController({
      downloadOllamaModel,
    } as unknown as AssistantLlmService);

    await expect(controller.downloadOllamaModel("qwen3:1.7b")).resolves.toEqual({
      enabled: true,
      model: "qwen3:1.7b",
      provider: "ollama",
      status: "ok",
    });
    expect(downloadOllamaModel).toHaveBeenCalledWith("qwen3:1.7b");
  });

  it("normalizes root synthesis json into final response", async () => {
    const generateMain = jest.fn().mockResolvedValue(
      '{"message":"Сейчас время 20:52.","context":"Привет. который час?","memory_writes":[],"tool_observations":[]}',
    );
    const controller = new AssistantLlmController({
      generateMain,
    } as unknown as AssistantLlmService);

    await expect(
      controller.conversationRespond({
        messages: [{ content: "который час?", role: "user" }],
        tools: [],
      }),
    ).resolves.toEqual({
      context: "Привет. который час?",
      memory_writes: [],
      message: "Сейчас время 20:52.",
      tool_observations: [],
      type: "final",
    });
  });

  it("normalizes root synthesis json with response field into final response", async () => {
    const generateMain = jest.fn().mockResolvedValue(
      '{"response":"Готово.","context":"Контекст","memory_writes":[],"tool_observations":[]}',
    );
    const controller = new AssistantLlmController({
      generateMain,
    } as unknown as AssistantLlmService);

    await expect(
      controller.conversationRespond({
        messages: [{ content: "сделай", role: "user" }],
      }),
    ).resolves.toEqual({
      context: "Контекст",
      memory_writes: [],
      message: "Готово.",
      tool_observations: [],
      type: "final",
    });
  });
});
