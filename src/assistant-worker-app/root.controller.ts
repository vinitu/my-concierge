import {
  Body,
  Controller,
  Get,
  Header,
  Put,
} from '@nestjs/common';
import type { AssistantLlmProviderStatus } from './worker/assistant-llm-provider-status';
import {
  defaultModelForProvider,
  STATIC_PROVIDER_MODELS,
} from './worker/assistant-llm-model-catalog';
import { AssistantLlmProviderStatusService } from './worker/assistant-llm-provider-status.service';
import type { AssistantWorkerProvider } from './worker/assistant-llm-provider';
import {
  AssistantWorkerConfigService,
  type AssistantWorkerConfig,
} from './worker/assistant-worker-config.service';
import { OllamaProviderStatusService } from './worker/ollama-provider-status.service';

interface UpdateWorkerConfigBody {
  deepseek_api_key?: string;
  deepseek_base_url?: string;
  deepseek_timeout_ms?: number | string;
  model?: string;
  memory_window?: number | string;
  ollama_base_url?: string;
  ollama_timeout_ms?: number | string;
  provider?: AssistantWorkerProvider | string;
  run_timeout_seconds?: number | string;
  thinking_interval_seconds?: number | string;
  xai_api_key?: string;
  xai_base_url?: string;
  xai_timeout_ms?: number | string;
}

@Controller()
export class AssistantWorkerRootController {
  constructor(
    private readonly assistantWorkerConfigService: AssistantWorkerConfigService,
    private readonly assistantLlmProviderStatusService: AssistantLlmProviderStatusService,
    private readonly ollamaProviderStatusService: OllamaProviderStatusService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getRoot(): Promise<string> {
    const config = await this.assistantWorkerConfigService.read();
    const providerStatus = await this.assistantLlmProviderStatusService.getStatus();
    const providerModels = await this.providerModels(config);

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>assistant-worker</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <style>
      :root {
        color-scheme: dark;
        --chat-bg: #090b10;
        --chat-surface: #11141b;
        --chat-surface-2: #171b24;
        --chat-line: rgba(255, 255, 255, 0.07);
        --chat-ink: #f3f4f6;
        --chat-muted: #98a2b3;
        --chat-accent: #7dd3fc;
        --chat-success: #c7f9e5;
        --chat-warning: #fbbf24;
        --chat-danger: #f87171;
        font-family: "Manrope", sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top, rgba(125, 211, 252, 0.08), transparent 22%),
          linear-gradient(180deg, #090b10 0%, #0d1016 100%);
        color: var(--chat-ink);
      }
      main {
        max-width: 960px;
        margin: 0 auto;
        padding: 24px 16px 32px;
      }
      .panel {
        border: 1px solid var(--chat-line);
        border-radius: 10px;
        background: var(--chat-surface);
        padding: 24px;
        box-shadow:
          0 20px 50px rgba(0, 0, 0, 0.34),
          inset 0 1px 0 rgba(255, 255, 255, 0.03);
      }
      h1 {
        margin: 0 0 10px;
        font-size: 32px;
      }
      p {
        margin: 0 0 16px;
        line-height: 1.5;
        color: var(--chat-muted);
      }
      label {
        display: block;
        margin: 20px 0 8px;
        font-weight: 600;
      }
      select, input, button {
        font: inherit;
      }
      select, input[type="number"], input[type="text"], input[type="password"], input[type="url"] {
        width: 100%;
        padding: 12px 14px;
        border-radius: 10px;
        border: 0;
        background: #0d1016;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
        color: var(--chat-ink);
      }
      button {
        margin-top: 18px;
        border: 0;
        border-radius: 10px;
        padding: 12px 18px;
        background: #f3f4f6;
        color: #0b0d12;
        cursor: pointer;
        font-weight: 700;
      }
      .meta {
        margin-top: 20px;
        padding-top: 18px;
        border-top: 1px solid var(--chat-line);
        font-size: 14px;
        color: var(--chat-muted);
      }
      .config-group {
        margin-top: 18px;
        padding: 16px;
        border-radius: 10px;
        background: var(--chat-surface-2);
        border: 1px solid var(--chat-line);
      }
      .config-group h2 {
        margin: 0 0 8px;
        font-size: 18px;
      }
      .config-group p {
        margin-bottom: 4px;
        font-size: 14px;
      }
      .status-grid {
        margin-top: 20px;
        display: grid;
        gap: 12px;
      }
      .status-card {
        padding: 14px 16px;
        border-radius: 10px;
        background: var(--chat-surface-2);
        border: 1px solid var(--chat-line);
      }
      .status-card strong {
        display: block;
        margin-bottom: 6px;
      }
      .status-pill {
        display: inline-block;
        margin-top: 8px;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
      }
      .status-pill.ready {
        background: rgba(125, 211, 252, 0.12);
        color: var(--chat-accent);
      }
      .status-pill.error {
        background: rgba(248, 113, 113, 0.12);
        color: var(--chat-danger);
      }
      .status-pill.missing_key {
        background: rgba(251, 191, 36, 0.12);
        color: var(--chat-warning);
      }
      #status {
        min-height: 24px;
        margin-top: 14px;
        font-size: 14px;
        color: var(--chat-muted);
      }
      code {
        color: var(--chat-success);
      }
      a {
        color: var(--chat-accent);
        text-decoration: none;
      }
      a:hover {
        text-decoration: underline;
      }
      @media (max-width: 640px) {
        main {
          padding: 16px 12px 24px;
        }

        .panel {
          padding: 18px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="panel">
        <h1>assistant-worker</h1>
        <p>Edit the runtime worker settings stored in <code>runtime/assistant-worker/config/worker.json</code>.</p>
        <form id="config-form">
          <label for="provider">LLM provider</label>
          <select id="provider" name="provider">
            <option value="deepseek"${config.provider === 'deepseek' ? ' selected' : ''}>deepseek</option>
            <option value="xai"${config.provider === 'xai' ? ' selected' : ''}>xai</option>
            <option value="ollama"${config.provider === 'ollama' ? ' selected' : ''}>ollama</option>
          </select>
          <label for="model">Model</label>
          <select id="model" name="model">${this.renderModelOptions(
            providerModels[config.provider] ?? [config.model],
            config.model,
          )}</select>
          <label for="memory-window">Remember messages</label>
          <input
            id="memory-window"
            name="memory_window"
            type="number"
            min="1"
            max="20"
            value="${String(config.memory_window)}"
          />
          <label for="thinking-interval-seconds">run.thinking interval (seconds)</label>
          <input
            id="thinking-interval-seconds"
            name="thinking_interval_seconds"
            type="number"
            min="1"
            max="30"
            value="${String(config.thinking_interval_seconds)}"
          />
          <label for="run-timeout-seconds">Run timeout (seconds)</label>
          <input
            id="run-timeout-seconds"
            name="run_timeout_seconds"
            type="number"
            min="5"
            max="600"
            value="${String(config.run_timeout_seconds)}"
          />
          <div class="config-group">
            <h2>xAI</h2>
            <p>Used when provider is <code>xai</code>.</p>
            <label for="xai-api-key">API key</label>
            <input id="xai-api-key" name="xai_api_key" type="password" value="${this.escapeHtml(config.xai_api_key)}" />
            <label for="xai-base-url">Base URL</label>
            <input id="xai-base-url" name="xai_base_url" type="url" value="${this.escapeHtml(config.xai_base_url)}" />
            <label for="xai-timeout-ms">Timeout (ms)</label>
            <input id="xai-timeout-ms" name="xai_timeout_ms" type="number" min="1000" max="3600000" value="${String(config.xai_timeout_ms)}" />
          </div>
          <div class="config-group">
            <h2>DeepSeek</h2>
            <p>Used when provider is <code>deepseek</code>.</p>
            <label for="deepseek-api-key">API key</label>
            <input id="deepseek-api-key" name="deepseek_api_key" type="password" value="${this.escapeHtml(config.deepseek_api_key)}" />
            <label for="deepseek-base-url">Base URL</label>
            <input id="deepseek-base-url" name="deepseek_base_url" type="url" value="${this.escapeHtml(config.deepseek_base_url)}" />
            <label for="deepseek-timeout-ms">Timeout (ms)</label>
            <input id="deepseek-timeout-ms" name="deepseek_timeout_ms" type="number" min="1000" max="3600000" value="${String(config.deepseek_timeout_ms)}" />
          </div>
          <div class="config-group">
            <h2>Ollama</h2>
            <p>Used when provider is <code>ollama</code>.</p>
            <label for="ollama-base-url">Base URL</label>
            <input id="ollama-base-url" name="ollama_base_url" type="url" value="${this.escapeHtml(config.ollama_base_url)}" />
            <label for="ollama-timeout-ms">Timeout (ms)</label>
            <input id="ollama-timeout-ms" name="ollama_timeout_ms" type="number" min="1000" max="3600000" value="${String(config.ollama_timeout_ms)}" />
          </div>
          <button type="submit">Save settings</button>
        </form>
        <div id="status"></div>
        <div class="status-grid">
          <div class="status-card">
            <strong>provider status</strong>
            <div>Selected provider: <span id="provider-value">${this.escapeHtml(config.provider)}</span></div>
            <div>Selected model: <span id="selected-model-value">${this.escapeHtml(config.model)}</span></div>
            <div>Memory window: <span id="memory-window-value">${String(config.memory_window)}</span></div>
            <div>Thinking interval: <span id="thinking-interval-value">${String(config.thinking_interval_seconds)}</span>s</div>
            <div>Provider id: <span id="provider-id">${this.escapeHtml(providerStatus.provider)}</span></div>
            <div>Configured model: <span id="provider-model">${this.escapeHtml(providerStatus.model)}</span></div>
            <div>Credential: <span id="provider-credential">${this.renderCredential(providerStatus)}</span></div>
            <div>Reachability: <span id="provider-reachable">${providerStatus.reachable ? 'working' : 'not working'}</span></div>
            <div>Details: <span id="provider-message">${this.escapeHtml(providerStatus.message)}</span></div>
            <span id="provider-status-pill" class="status-pill ${providerStatus.status}">${this.escapeHtml(providerStatus.status)}</span>
          </div>
        </div>
        <div class="meta">
          <div><a href="/status">status</a></div>
          <div><a href="/metrics">metrics</a></div>
          <div><a href="/provider-status">provider-status</a></div>
          <div><a href="/openapi.json">openapi</a></div>
        </div>
      </section>
    </main>
    <script>
      const providerModels = ${JSON.stringify(providerModels)};
      const form = document.getElementById('config-form');
      const providerField = document.getElementById('provider');
      const modelField = document.getElementById('model');
      const status = document.getElementById('status');

      function escapeHtml(value) {
        return String(value)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');
      }

      function renderModelOptions(provider, selectedModel) {
        const models = providerModels[provider] && providerModels[provider].length > 0
          ? providerModels[provider]
          : [selectedModel];

        modelField.innerHTML = models
          .map((model) => '<option value="' + escapeHtml(model) + '"' + (model === selectedModel ? ' selected' : '') + '>' + escapeHtml(model) + '</option>')
          .join('');
      }

      providerField.addEventListener('change', () => {
        const provider = providerField.value;
        const models = providerModels[provider] && providerModels[provider].length > 0
          ? providerModels[provider]
          : [''];
        renderModelOptions(provider, models[0] || '');
      });

      form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const provider = document.getElementById('provider').value;
        const model = document.getElementById('model').value;
        const memoryWindow = document.getElementById('memory-window').value;
        const thinkingIntervalSeconds = document.getElementById('thinking-interval-seconds').value;
        const runTimeoutSeconds = document.getElementById('run-timeout-seconds').value;
        const xaiApiKey = document.getElementById('xai-api-key').value;
        const xaiBaseUrl = document.getElementById('xai-base-url').value;
        const xaiTimeoutMs = document.getElementById('xai-timeout-ms').value;
        const deepseekApiKey = document.getElementById('deepseek-api-key').value;
        const deepseekBaseUrl = document.getElementById('deepseek-base-url').value;
        const deepseekTimeoutMs = document.getElementById('deepseek-timeout-ms').value;
        const ollamaBaseUrl = document.getElementById('ollama-base-url').value;
        const ollamaTimeoutMs = document.getElementById('ollama-timeout-ms').value;
        status.textContent = 'Saving...';

        const response = await fetch('/config', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            deepseek_api_key: deepseekApiKey,
            deepseek_base_url: deepseekBaseUrl,
            deepseek_timeout_ms: deepseekTimeoutMs,
            memory_window: memoryWindow,
            model,
            ollama_base_url: ollamaBaseUrl,
            ollama_timeout_ms: ollamaTimeoutMs,
            provider,
            run_timeout_seconds: runTimeoutSeconds,
            thinking_interval_seconds: thinkingIntervalSeconds,
            xai_api_key: xaiApiKey,
            xai_base_url: xaiBaseUrl,
            xai_timeout_ms: xaiTimeoutMs,
          }),
        });

        if (!response.ok) {
          status.textContent = 'Failed to save settings';
          return;
        }

        const payload = await response.json();
        status.textContent = 'Saved provider: ' + payload.provider + ', model: ' + payload.model + ', memory window: ' + payload.memory_window + ', thinking interval: ' + payload.thinking_interval_seconds + 's, run timeout: ' + payload.run_timeout_seconds + 's';
        document.getElementById('provider-value').textContent = payload.provider;
        document.getElementById('selected-model-value').textContent = payload.model;
        document.getElementById('provider').value = payload.provider;
        renderModelOptions(payload.provider, payload.model);
        document.getElementById('memory-window-value').textContent = String(payload.memory_window);
        document.getElementById('memory-window').value = String(payload.memory_window);
        document.getElementById('thinking-interval-value').textContent = String(payload.thinking_interval_seconds);
        document.getElementById('thinking-interval-seconds').value = String(payload.thinking_interval_seconds);
        document.getElementById('run-timeout-seconds').value = String(payload.run_timeout_seconds);
        document.getElementById('xai-api-key').value = payload.xai_api_key;
        document.getElementById('xai-base-url').value = payload.xai_base_url;
        document.getElementById('xai-timeout-ms').value = String(payload.xai_timeout_ms);
        document.getElementById('deepseek-api-key').value = payload.deepseek_api_key;
        document.getElementById('deepseek-base-url').value = payload.deepseek_base_url;
        document.getElementById('deepseek-timeout-ms').value = String(payload.deepseek_timeout_ms);
        document.getElementById('ollama-base-url').value = payload.ollama_base_url;
        document.getElementById('ollama-timeout-ms').value = String(payload.ollama_timeout_ms);
        await refreshProviderStatus();
      });

      async function refreshProviderStatus() {
        const response = await fetch('/provider-status');

        if (!response.ok) {
          document.getElementById('provider-message').textContent = 'Failed to load provider status';
          document.getElementById('provider-reachable').textContent = 'not working';
          document.getElementById('provider-status-pill').textContent = 'error';
          document.getElementById('provider-status-pill').className = 'status-pill error';
          return;
        }

        const payload = await response.json();
        document.getElementById('provider-id').textContent = payload.provider;
        document.getElementById('provider-model').textContent = payload.model;
        document.getElementById('provider-credential').textContent =
          payload.apiKeyConfigured === null ? 'not required' : (payload.apiKeyConfigured ? 'configured' : 'missing');
        document.getElementById('provider-reachable').textContent = payload.reachable ? 'working' : 'not working';
        document.getElementById('provider-message').textContent = payload.message;
        document.getElementById('provider-status-pill').textContent = payload.status;
        document.getElementById('provider-status-pill').className = 'status-pill ' + payload.status;
      }

      void refreshProviderStatus();
    </script>
  </body>
</html>`;
  }

  @Get('config')
  async getConfig(): Promise<AssistantWorkerConfig> {
    return this.assistantWorkerConfigService.read();
  }

  @Get('provider-status')
  async getProviderStatus(): Promise<AssistantLlmProviderStatus> {
    return this.assistantLlmProviderStatusService.getStatus();
  }

  @Put('config')
  async updateConfig(@Body() body: UpdateWorkerConfigBody): Promise<AssistantWorkerConfig> {
    const provider = this.normalizeProvider(body.provider);

    return this.assistantWorkerConfigService.write({
      deepseek_api_key:
        typeof body.deepseek_api_key === 'string' ? body.deepseek_api_key : '',
      deepseek_base_url:
        typeof body.deepseek_base_url === 'string' ? body.deepseek_base_url : '',
      deepseek_timeout_ms:
        typeof body.deepseek_timeout_ms === 'number'
          ? body.deepseek_timeout_ms
          : typeof body.deepseek_timeout_ms === 'string'
            ? Number.parseInt(body.deepseek_timeout_ms, 10)
            : 360000,
      model:
        typeof body.model === 'string' && body.model.trim()
          ? body.model.trim()
          : defaultModelForProvider(provider),
      memory_window:
        typeof body.memory_window === 'number'
          ? body.memory_window
          : typeof body.memory_window === 'string'
            ? Number.parseInt(body.memory_window, 10)
            : 3,
      ollama_base_url:
        typeof body.ollama_base_url === 'string' ? body.ollama_base_url : '',
      ollama_timeout_ms:
        typeof body.ollama_timeout_ms === 'number'
          ? body.ollama_timeout_ms
          : typeof body.ollama_timeout_ms === 'string'
            ? Number.parseInt(body.ollama_timeout_ms, 10)
            : 360000,
      provider,
      run_timeout_seconds:
        typeof body.run_timeout_seconds === 'number'
          ? body.run_timeout_seconds
          : typeof body.run_timeout_seconds === 'string'
            ? Number.parseInt(body.run_timeout_seconds, 10)
            : 30,
      thinking_interval_seconds:
        typeof body.thinking_interval_seconds === 'number'
          ? body.thinking_interval_seconds
          : typeof body.thinking_interval_seconds === 'string'
            ? Number.parseInt(body.thinking_interval_seconds, 10)
            : 2,
      xai_api_key: typeof body.xai_api_key === 'string' ? body.xai_api_key : '',
      xai_base_url: typeof body.xai_base_url === 'string' ? body.xai_base_url : '',
      xai_timeout_ms:
        typeof body.xai_timeout_ms === 'number'
          ? body.xai_timeout_ms
          : typeof body.xai_timeout_ms === 'string'
            ? Number.parseInt(body.xai_timeout_ms, 10)
            : 360000,
    });
  }

  private normalizeProvider(value: AssistantWorkerProvider | string | undefined): AssistantWorkerProvider {
    const normalized = value?.trim().toLowerCase();

    if (normalized === 'deepseek' || normalized === 'ollama' || normalized === 'xai') {
      return normalized;
    }

    return 'xai';
  }

  private async providerModels(
    config: AssistantWorkerConfig,
  ): Promise<Record<AssistantWorkerProvider, string[]>> {
    const ollamaModels = await this.ollamaProviderStatusService.listAvailableModels();

    return {
      deepseek: [...STATIC_PROVIDER_MODELS.deepseek],
      ollama: this.mergeModels(
        [...STATIC_PROVIDER_MODELS.ollama, ...ollamaModels],
        config.provider === 'ollama' ? config.model : null,
      ),
      xai: [...STATIC_PROVIDER_MODELS.xai],
    };
  }

  private mergeModels(models: string[], currentModel: string | null): string[] {
    const next = [...new Set(models)];

    if (currentModel && !next.includes(currentModel)) {
      next.unshift(currentModel);
    }

    return next;
  }

  private renderModelOptions(models: string[], selectedModel: string): string {
    return models
      .map(
        (model) =>
          `<option value="${this.escapeHtml(model)}"${
            model === selectedModel ? ' selected' : ''
          }>${this.escapeHtml(model)}</option>`,
      )
      .join('');
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  private renderCredential(status: AssistantLlmProviderStatus): string {
    if (status.apiKeyConfigured === null) {
      return 'not required';
    }

    return status.apiKeyConfigured ? 'configured' : 'missing';
  }
}
