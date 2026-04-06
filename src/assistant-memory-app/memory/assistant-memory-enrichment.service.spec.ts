import { ConfigService } from "@nestjs/config";
import { AssistantMemoryConfigService } from "../assistant-memory-config.service";
import { AssistantMemoryRunEventPublisherService } from "../run-events/assistant-memory-run-event-publisher.service";
import { AssistantMemoryEnrichmentService } from "./assistant-memory-enrichment.service";
import { AssistantMemoryLlmClientService } from "./assistant-memory-llm-client.service";
import { AssistantMemoryService } from "./assistant-memory.service";

describe("AssistantMemoryEnrichmentService", () => {
  it("enqueues summary together with enabled extract jobs", async () => {
    const rPush = jest.fn().mockResolvedValue(1);
    const service = new AssistantMemoryEnrichmentService(
      new ConfigService({}),
      {
        read: jest.fn().mockResolvedValue({
          enabled_extracts: ["fact", "profile"],
        }),
      } as unknown as AssistantMemoryConfigService,
      {
        publish: jest.fn(),
      } as unknown as AssistantMemoryRunEventPublisherService,
      {} as AssistantMemoryLlmClientService,
      {} as AssistantMemoryService,
    );
    jest
      .spyOn(service as never, "getClient")
      .mockResolvedValue({ rPush } as never);

    await service.enqueue({
      chat: "direct",
      conversation_id: "thread-1",
      direction: "web",
      message_text: "hello",
      request_id: "req-1",
      user_id: "alex",
    });

    expect(rPush).toHaveBeenCalledTimes(3);
    expect(rPush).toHaveBeenNthCalledWith(
      1,
      "assistant:memory:enrichment",
      expect.stringContaining('"extract":"summary"'),
    );
    expect(rPush).toHaveBeenNthCalledWith(
      2,
      "assistant:memory:enrichment",
      expect.stringContaining('"extract":"fact"'),
    );
    expect(rPush).toHaveBeenNthCalledWith(
      3,
      "assistant:memory:enrichment",
      expect.stringContaining('"extract":"profile"'),
    );
  });

  it("updates conversation summary during async summary job", async () => {
    const assistantMemoryService = {
      searchConversation: jest.fn().mockResolvedValue({
        messages: [
          {
            content: "привет",
            created_at: "2026-04-06T12:00:00.000Z",
            role: "user",
          },
          {
            content: "Привет!",
            created_at: "2026-04-06T12:00:01.000Z",
            role: "assistant",
          },
        ],
        summary: "Previous summary.",
        thread_id: "thread-1",
      }),
      updateConversationSummary: jest.fn().mockResolvedValue(undefined),
    } as unknown as AssistantMemoryService;
    const assistantMemoryLlmClientService = {
      summarizeConversation: jest.fn().mockResolvedValue("Updated summary."),
    } as unknown as AssistantMemoryLlmClientService;
    const service = new AssistantMemoryEnrichmentService(
      new ConfigService({}),
      {
        read: jest.fn().mockResolvedValue({
          enabled_extracts: ["fact", "profile"],
        }),
      } as unknown as AssistantMemoryConfigService,
      {
        publish: jest.fn(),
      } as unknown as AssistantMemoryRunEventPublisherService,
      assistantMemoryLlmClientService,
      assistantMemoryService,
    );

    await service["processJob"]({
      chat: "direct",
      conversation_id: "thread-1",
      direction: "web",
      extract: "summary",
      request_id: "req-1",
      user_id: "alex",
    });

    expect(assistantMemoryLlmClientService.summarizeConversation).toHaveBeenCalledWith(
      "thread-1",
      [
        { content: "привет", role: "user" },
        { content: "Привет!", role: "assistant" },
      ],
      "Previous summary.",
    );
    expect(assistantMemoryService.updateConversationSummary).toHaveBeenCalledWith(
      "thread-1",
      "Updated summary.",
    );
  });

  it("filters fallback assistant replies and poisoned previous summary before async summary", async () => {
    const assistantMemoryService = {
      searchConversation: jest.fn().mockResolvedValue({
        messages: [
          {
            content: "какие у меня есть файлы?",
            created_at: "2026-04-06T12:00:00.000Z",
            role: "user",
          },
          {
            content:
              "Не удалось корректно обработать ответ модели. Попробуйте выбрать другую LLM модель в настройках.",
            created_at: "2026-04-06T12:00:01.000Z",
            role: "assistant",
          },
        ],
        summary:
          "Не удалось обработать вопрос о файлах. Попробуйте выбрать другую модель в настройках.",
        thread_id: "thread-1",
      }),
      updateConversationSummary: jest.fn().mockResolvedValue(undefined),
    } as unknown as AssistantMemoryService;
    const assistantMemoryLlmClientService = {
      summarizeConversation: jest
        .fn()
        .mockResolvedValue("Пользователь спрашивает, какие файлы доступны в домашней директории."),
    } as unknown as AssistantMemoryLlmClientService;
    const service = new AssistantMemoryEnrichmentService(
      new ConfigService({}),
      {
        read: jest.fn().mockResolvedValue({
          enabled_extracts: ["fact", "profile"],
        }),
      } as unknown as AssistantMemoryConfigService,
      {
        publish: jest.fn(),
      } as unknown as AssistantMemoryRunEventPublisherService,
      assistantMemoryLlmClientService,
      assistantMemoryService,
    );

    await service["processJob"]({
      chat: "direct",
      conversation_id: "thread-1",
      direction: "web",
      extract: "summary",
      request_id: "req-2",
      user_id: "alex",
    });

    expect(assistantMemoryLlmClientService.summarizeConversation).toHaveBeenCalledWith(
      "thread-1",
      [{ content: "какие у меня есть файлы?", role: "user" }],
      "",
    );
    expect(assistantMemoryService.updateConversationSummary).toHaveBeenCalledWith(
      "thread-1",
      "Пользователь спрашивает, какие файлы доступны в домашней директории.",
    );
  });
});
