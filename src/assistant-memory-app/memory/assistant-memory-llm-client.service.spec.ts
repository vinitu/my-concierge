import { ConfigService } from "@nestjs/config";
import { AssistantMemoryLlmClientService } from "./assistant-memory-llm-client.service";

describe("AssistantMemoryLlmClientService", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("calls assistant-llm facts endpoint and normalizes items", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        items: ["  User Dmytro lives in Warsaw.  ", "", "User likes tea."],
      }),
      ok: true,
    }) as unknown as typeof fetch;

    const service = new AssistantMemoryLlmClientService(
      new ConfigService({
        ASSISTANT_LLM_URL: "http://assistant-llm:3000/",
      }),
    );

    const result = await service.extractFacts("conv-1", [
      { content: "hi", role: "user" },
    ]);

    expect(result).toEqual(["User Dmytro lives in Warsaw.", "User likes tea."]);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://assistant-llm:3000/v1/memory/facts",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("throws with endpoint details when assistant-llm returns non-2xx", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => '{"message":"Internal server error"}',
    }) as unknown as typeof fetch;

    const service = new AssistantMemoryLlmClientService(
      new ConfigService({
        ASSISTANT_LLM_URL: "http://assistant-llm:3000",
      }),
    );

    await expect(
      service.extractFacts("conv-1", [{ content: "hello", role: "user" }]),
    ).rejects.toThrow(
      "assistant-llm returned 500 for /v1/memory/facts: {\"message\":\"Internal server error\"}",
    );
  });
});
