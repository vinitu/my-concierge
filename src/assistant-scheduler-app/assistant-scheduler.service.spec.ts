import { ConfigService } from "@nestjs/config";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AssistantSchedulerConfigService } from "./assistant-scheduler-config.service";
import { AssistantSchedulerService } from "./assistant-scheduler.service";

describe("AssistantSchedulerService", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("creates, updates, and deletes jobs in runtime store", async () => {
    const runtimeDir = await mkdtemp(join(tmpdir(), "assistant-scheduler-"));
    const configService = new ConfigService({
      ASSISTANT_API_URL: "http://assistant-api:3000",
      ASSISTANT_SCHEDULER_RUNTIME_DIR: runtimeDir,
      ASSISTANT_SCHEDULER_POLL_MS: "1000",
    });
    const schedulerConfigService = new AssistantSchedulerConfigService(configService);
    const service = new AssistantSchedulerService(
      configService,
      schedulerConfigService,
    );
    await service.onModuleInit();

    const created = await service.createJob({
      chat: "direct",
      conversation_id: "conv_1",
      direction: "web",
      every_seconds: 10,
      message: "hello",
      name: "job 1",
      user_id: "default-user",
    });
    expect(created.id).toBeTruthy();

    const updated = await service.updateJob(created.id, {
      enabled: false,
      message: "updated",
    });
    expect(updated.enabled).toBe(false);
    expect(updated.message).toBe("updated");

    await expect(service.listJobs()).resolves.toHaveLength(1);
    await expect(service.deleteJob(created.id)).resolves.toEqual({
      status: "deleted",
    });
    await expect(service.listJobs()).resolves.toHaveLength(0);

    service.onModuleDestroy();
  });

  it("dispatches run-now job to assistant-api and stores request id", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ request_id: "req_123" }),
      ok: true,
    }) as unknown as typeof fetch;

    const runtimeDir = await mkdtemp(join(tmpdir(), "assistant-scheduler-"));
    const configService = new ConfigService({
      ASSISTANT_API_URL: "http://assistant-api:3000",
      ASSISTANT_SCHEDULER_RUNTIME_DIR: runtimeDir,
      ASSISTANT_SCHEDULER_POLL_MS: "1000",
    });
    const schedulerConfigService = new AssistantSchedulerConfigService(configService);
    const service = new AssistantSchedulerService(
      configService,
      schedulerConfigService,
    );
    await service.onModuleInit();

    const created = await service.createJob({
      chat: "direct",
      conversation_id: "conv_2",
      direction: "web",
      every_seconds: 10,
      message: "ping",
      name: "job 2",
      user_id: "default-user",
    });

    const executed = await service.runJobNow(created.id);
    expect(executed.last_request_id).toBe("req_123");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://assistant-api:3000/conversation/web/direct/default-user",
      expect.objectContaining({
        method: "POST",
      }),
    );

    service.onModuleDestroy();
  });
});
