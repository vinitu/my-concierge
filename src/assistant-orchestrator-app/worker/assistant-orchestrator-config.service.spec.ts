import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import type { AssistantToolName } from './assistant-tool-catalog.service';
import { AssistantOrchestratorConfigService } from './assistant-orchestrator-config.service';

describe('AssistantOrchestratorConfigService', () => {
  it('drops unsupported tool names from enabled_tools', async () => {
    const datadir = await mkdtemp(join(tmpdir(), 'assistant-orchestrator-config-'));
    const service = new AssistantOrchestratorConfigService(
      new ConfigService({
        ASSISTANT_DATADIR: datadir,
      }),
    );

    await service.write({
      brave_api_key: '',
      brave_base_url: 'https://api.search.brave.com',
      brave_timeout_ms: 30000,
      enabled_tools: [
        'legacy_fact_search',
        'memory_fact_search',
      ] as unknown as AssistantToolName[],
      memory_window: 6,
      run_timeout_seconds: 30,
      thinking_interval_seconds: 2,
    });

    const config = await service.read();
    expect(config.enabled_tools).toEqual(['memory_fact_search']);
  });
});
