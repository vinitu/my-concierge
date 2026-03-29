import { ConfigService } from "@nestjs/config";
import type { RunEvent } from "../../contracts/assistant-transport";
import { CallbackDeliveryService } from "./callback-delivery.service";

describe("CallbackDeliveryService", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function service(): CallbackDeliveryService {
    return new CallbackDeliveryService(
      new ConfigService({
        GATEWAY_WEB_CALLBACK_URL: "http://gateway-web:3000",
      }),
    );
  }

  function baseEvent(eventType: RunEvent["eventType"]): RunEvent {
    return {
      channel: "memory",
      conversationId: "conv_1",
      createdAt: "2026-03-29T00:00:00.000Z",
      direction: "web",
      eventType,
      payload: {},
      requestId: "req_1",
      sequence: 1,
      userId: "user_1",
    };
  }

  it("suppresses memory extract events", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const delivered = await service().deliver(
      baseEvent("memory.extract.completed"),
    );

    expect(delivered).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("suppresses non-added memory events", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const delivered = await service().deliver(baseEvent("memory.fact.updated"));

    expect(delivered).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("delivers only memory.*.added with friendly message", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;

    const delivered = await service().deliver(baseEvent("memory.fact.added"));

    expect(delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://gateway-web:3000/event/conv_1");
    expect(typeof request.body).toBe("string");
    expect(request.body).toContain('"message":"Remembered new fact."');
    expect(request.body).toContain('"type":"memory.fact.added"');
  });
});
