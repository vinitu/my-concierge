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

  it("delivers memory profile events", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;

    const delivered = await service().deliver(baseEvent("memory.profile.updated"));

    expect(delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://gateway-web:3000/event/conv_1");
    expect(typeof request.body).toBe("string");
    expect(request.body).toContain('"type":"memory.profile.updated"');
    expect(request.body).toContain('"request_id":"req_1"');
    expect(request.body).toContain('"sequence":1');
  });

  it("delivers memory updated events", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;

    const delivered = await service().deliver(baseEvent("memory.fact.updated"));

    expect(delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://gateway-web:3000/event/conv_1");
    expect(typeof request.body).toBe("string");
    expect(request.body).toContain('"type":"memory.fact.updated"');
    expect(request.body).toContain('"request_id":"req_1"');
    expect(request.body).toContain('"sequence":1');
  });

  it("delivers tool events", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;

    const delivered = await service().deliver({
      ...baseEvent("run.tool"),
      payload: {
        message: "Executed web_search successfully.",
        ok: true,
        payload: { result_count: 3 },
        tool_name: "web_search",
      },
    });

    expect(delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://gateway-web:3000/tool/conv_1");
    expect(typeof request.body).toBe("string");
    expect(request.body).toContain('"tool_name":"web_search"');
    expect(request.body).toContain('"ok":true');
    expect(request.body).toContain('"request_id":"req_1"');
    expect(request.body).toContain('"sequence":1');
  });
});
