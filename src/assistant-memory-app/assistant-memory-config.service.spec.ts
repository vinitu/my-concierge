import { ConfigService } from "@nestjs/config";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AssistantMemoryConfigService } from "./assistant-memory-config.service";

describe("AssistantMemoryConfigService", () => {
  it("creates default config with fact extraction enabled", async () => {
    const runtimeDir = await mkdtemp(
      join(tmpdir(), "assistant-memory-config-"),
    );
    const service = new AssistantMemoryConfigService(
      new ConfigService({
        ASSISTANT_MEMORY_RUNTIME_DIR: runtimeDir,
      }),
    );

    const config = await service.read();
    expect(config.enabled_extracts).toEqual(["fact"]);

    const file = await readFile(
      join(runtimeDir, "config", "assistant-memory.json"),
      "utf8",
    );
    expect(file).toContain('"enabled_extracts"');
  });

  it("writes and normalizes enabled extracts to supported set", async () => {
    const runtimeDir = await mkdtemp(
      join(tmpdir(), "assistant-memory-config-"),
    );
    const service = new AssistantMemoryConfigService(
      new ConfigService({
        ASSISTANT_MEMORY_RUNTIME_DIR: runtimeDir,
      }),
    );

    const updated = await service.write({
      enabled_extracts: ["fact", "fact"],
    });

    expect(updated.enabled_extracts).toEqual(["fact"]);
  });
});
