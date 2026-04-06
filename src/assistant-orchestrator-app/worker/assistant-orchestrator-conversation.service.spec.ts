import { ConfigService } from "@nestjs/config";
import { AssistantOrchestratorConversationService } from "./assistant-orchestrator-conversation.service";

describe("AssistantOrchestratorConversationService", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("reads conversation via assistant-memory and applies memory window", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        chat: "direct",
        context: "ctx",
        direction: "api",
        messages: [
          { content: "a", created_at: "2026-03-01T10:00:00.000Z", role: "user" },
          {
            content: "b",
            created_at: "2026-03-01T10:00:01.000Z",
            role: "assistant",
          },
          { content: "c", created_at: "2026-03-01T10:00:02.000Z", role: "user" },
        ],
        updated_at: "2026-03-01T10:00:02.000Z",
        user_id: "alex",
      }),
      ok: true,
    }) as unknown as typeof fetch;

    const service = new AssistantOrchestratorConversationService(
      {
        read: jest.fn().mockResolvedValue({ memory_window: 2 }),
      } as never,
      new ConfigService({
        ASSISTANT_MEMORY_URL: "http://assistant-memory:3000",
      }),
    );

    const result = await service.read({
      accepted_at: "2026-03-01T10:00:03.000Z",
      chat: "direct",
      conversation_id: "thread_1",
      direction: "api",
      message: "hello",
      request_id: "req_1",
      user_id: "alex",
    });

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]?.content).toBe("b");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://assistant-memory:3000/v1/conversations/read",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("appends exchange via assistant-memory and forwards request_id", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        chat: "direct",
        context: "updated ctx",
        direction: "api",
        messages: [
          {
            content: "hello",
            created_at: "2026-03-01T10:00:00.000Z",
            role: "user",
          },
          {
            content: "hi there",
            created_at: "2026-03-01T10:00:01.000Z",
            role: "assistant",
          },
        ],
        updated_at: "2026-03-01T10:00:01.000Z",
        user_id: "alex",
      }),
      ok: true,
    }) as unknown as typeof fetch;

    const service = new AssistantOrchestratorConversationService(
      {
        read: jest.fn().mockResolvedValue({ memory_window: 6 }),
      } as never,
      new ConfigService({
        ASSISTANT_MEMORY_URL: "http://assistant-memory:3000",
      }),
    );

    const result = await service.appendExchange(
      {
        accepted_at: "2026-03-01T10:00:00.000Z",
        chat: "direct",
        conversation_id: "thread_1",
        direction: "api",
        message: "hello",
        request_id: "req_1",
        user_id: "alex",
      },
      {
        context: "updated ctx",
        message: "hi there",
      },
      "req_1",
    );

    expect(result.context).toBe("updated ctx");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://assistant-memory:3000/v1/conversations/append",
      expect.objectContaining({
        body: expect.stringContaining('"request_id":"req_1"'),
        method: "POST",
      }),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "http://assistant-memory:3000/v1/conversations/append",
      expect.objectContaining({
        body: expect.not.stringContaining('"context"'),
      }),
    );
  });
});
