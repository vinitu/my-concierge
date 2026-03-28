import { ConfigService } from '@nestjs/config';
import {
  mkdtemp,
  readFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssistantWorkerConfigService } from './assistant-worker-config.service';
import { SUPPORTED_ASSISTANT_TOOL_NAMES } from './assistant-tool-catalog.service';

describe('AssistantWorkerConfigService', () => {
  it('creates the default worker config when missing', async () => {
    const datadir = await mkdtemp(join(tmpdir(), 'assistant-worker-config-'));
    const service = new AssistantWorkerConfigService(
      new ConfigService({
        ASSISTANT_DATADIR: datadir,
      }),
    );

    await expect(service.read()).resolves.toEqual({
      brave_api_key: '',
      brave_base_url: 'https://api.search.brave.com',
      brave_timeout_ms: 30000,
      deepseek_api_key: '',
      deepseek_base_url: 'https://api.deepseek.com',
      deepseek_timeout_ms: 360000,
      enabled_tools: [...SUPPORTED_ASSISTANT_TOOL_NAMES],
      model: 'grok-4',
      memory_window: 3,
      ollama_base_url: 'http://host.docker.internal:11434',
      ollama_timeout_ms: 360000,
      provider: 'xai',
      run_timeout_seconds: 30,
      thinking_interval_seconds: 2,
      xai_api_key: '',
      xai_base_url: 'https://api.x.ai/v1',
      xai_timeout_ms: 360000,
    });

    await expect(readFile(join(datadir, 'config', 'worker.json'), 'utf8')).resolves.toContain(
      '"provider": "xai"',
    );
  });

  it('writes the worker config to the assistant-worker runtime directory', async () => {
    const datadir = await mkdtemp(join(tmpdir(), 'assistant-worker-config-'));
    const service = new AssistantWorkerConfigService(
      new ConfigService({
        ASSISTANT_DATADIR: datadir,
      }),
    );

    await expect(
      service.write({
        brave_api_key: '',
        brave_base_url: 'https://api.search.brave.com',
        brave_timeout_ms: 30000,
        deepseek_api_key: '',
        deepseek_base_url: 'https://api.deepseek.com',
        deepseek_timeout_ms: 360000,
        enabled_tools: [...SUPPORTED_ASSISTANT_TOOL_NAMES],
        memory_window: 3,
        model: 'grok-4',
        ollama_base_url: 'http://host.docker.internal:11434',
        ollama_timeout_ms: 360000,
        provider: 'xai',
        run_timeout_seconds: 30,
        thinking_interval_seconds: 2,
        xai_api_key: '',
        xai_base_url: 'https://api.x.ai/v1',
        xai_timeout_ms: 360000,
      }),
    ).resolves.toEqual({
      brave_api_key: '',
      brave_base_url: 'https://api.search.brave.com',
      brave_timeout_ms: 30000,
      deepseek_api_key: '',
      deepseek_base_url: 'https://api.deepseek.com',
      deepseek_timeout_ms: 360000,
      enabled_tools: [...SUPPORTED_ASSISTANT_TOOL_NAMES],
      model: 'grok-4',
      memory_window: 3,
      ollama_base_url: 'http://host.docker.internal:11434',
      ollama_timeout_ms: 360000,
      provider: 'xai',
      run_timeout_seconds: 30,
      thinking_interval_seconds: 2,
      xai_api_key: '',
      xai_base_url: 'https://api.x.ai/v1',
      xai_timeout_ms: 360000,
    });

    await expect(readFile(join(datadir, 'config', 'worker.json'), 'utf8')).resolves.toContain(
      '"provider": "xai"',
    );
  });

  it('normalizes supported provider values', async () => {
    const datadir = await mkdtemp(join(tmpdir(), 'assistant-worker-config-'));
    const service = new AssistantWorkerConfigService(
      new ConfigService({
        ASSISTANT_DATADIR: datadir,
      }),
    );

    await expect(
      service.write({
        brave_api_key: '',
        brave_base_url: 'https://api.search.brave.com',
        brave_timeout_ms: 30000,
        deepseek_api_key: '',
        deepseek_base_url: 'https://api.deepseek.com',
        deepseek_timeout_ms: 360000,
        enabled_tools: [...SUPPORTED_ASSISTANT_TOOL_NAMES],
        memory_window: 9,
        model: 'deepseek-r1:latest',
        ollama_base_url: 'http://host.docker.internal:11434',
        ollama_timeout_ms: 360000,
        provider: 'OLLAMA' as never,
        run_timeout_seconds: 30,
        thinking_interval_seconds: 4,
        xai_api_key: '',
        xai_base_url: 'https://api.x.ai/v1',
        xai_timeout_ms: 360000,
      }),
    ).resolves.toEqual({
      brave_api_key: '',
      brave_base_url: 'https://api.search.brave.com',
      brave_timeout_ms: 30000,
      deepseek_api_key: '',
      deepseek_base_url: 'https://api.deepseek.com',
      deepseek_timeout_ms: 360000,
      enabled_tools: [...SUPPORTED_ASSISTANT_TOOL_NAMES],
      model: 'deepseek-r1:latest',
      memory_window: 9,
      ollama_base_url: 'http://host.docker.internal:11434',
      ollama_timeout_ms: 360000,
      provider: 'ollama',
      run_timeout_seconds: 30,
      thinking_interval_seconds: 4,
      xai_api_key: '',
      xai_base_url: 'https://api.x.ai/v1',
      xai_timeout_ms: 360000,
    });

    await expect(
      service.write({
        brave_api_key: '',
        brave_base_url: 'https://api.search.brave.com',
        brave_timeout_ms: 30000,
        deepseek_api_key: '',
        deepseek_base_url: 'https://api.deepseek.com',
        deepseek_timeout_ms: 360000,
        enabled_tools: [...SUPPORTED_ASSISTANT_TOOL_NAMES],
        memory_window: 9,
        model: 'deepseek-reasoner',
        ollama_base_url: 'http://host.docker.internal:11434',
        ollama_timeout_ms: 360000,
        provider: 'DEEPSEEK' as never,
        run_timeout_seconds: 30,
        thinking_interval_seconds: 4,
        xai_api_key: '',
        xai_base_url: 'https://api.x.ai/v1',
        xai_timeout_ms: 360000,
      }),
    ).resolves.toEqual({
      brave_api_key: '',
      brave_base_url: 'https://api.search.brave.com',
      brave_timeout_ms: 30000,
      deepseek_api_key: '',
      deepseek_base_url: 'https://api.deepseek.com',
      deepseek_timeout_ms: 360000,
      enabled_tools: [...SUPPORTED_ASSISTANT_TOOL_NAMES],
      model: 'deepseek-reasoner',
      memory_window: 9,
      ollama_base_url: 'http://host.docker.internal:11434',
      ollama_timeout_ms: 360000,
      provider: 'deepseek',
      run_timeout_seconds: 30,
      thinking_interval_seconds: 4,
      xai_api_key: '',
      xai_base_url: 'https://api.x.ai/v1',
      xai_timeout_ms: 360000,
    });
  });
});
