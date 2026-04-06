import { ConfigService } from '@nestjs/config';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssistantLlmConfigService } from './assistant-llm-config.service';

describe('AssistantLlmConfigService', () => {
  it('normalizes unsupported ollama models to the default tools-capable model', async () => {
    const datadir = await mkdtemp(join(tmpdir(), 'assistant-llm-config-'));
    const service = new AssistantLlmConfigService(
      new ConfigService({
        ASSISTANT_DATADIR: datadir,
      }),
    );

    await service.write({
      deepseek_api_key: '',
      deepseek_base_url: 'https://api.deepseek.com',
      deepseek_timeout_ms: 360000,
      model: 'gemma3:1b',
      ollama_base_url: 'http://ollama.local',
      ollama_timeout_ms: 360000,
      provider: 'ollama',
      response_repair_attempts: 99,
      xai_api_key: '',
      xai_base_url: 'https://api.x.ai/v1',
      xai_timeout_ms: 360000,
    });

    const config = await service.read();
    expect(config.provider).toBe('ollama');
    expect(config.model).toBe('qwen3:1.7b');
    expect(config.response_repair_attempts).toBe(5);
  });
});
