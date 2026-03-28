import {
  Body,
  Controller,
  Get,
  Header,
  Put,
} from '@nestjs/common';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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
import {
  type AssistantToolName,
  AssistantToolCatalogService,
} from './worker/assistant-tool-catalog.service';
import {
  type AssistantConversationThreadListItem,
  AssistantWorkerConversationService,
} from './worker/assistant-worker-conversation.service';

interface UpdateWorkerConfigBody {
  brave_api_key?: string;
  brave_base_url?: string;
  brave_timeout_ms?: number | string;
  deepseek_api_key?: string;
  deepseek_base_url?: string;
  deepseek_timeout_ms?: number | string;
  enabled_tools?: string[];
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

interface AssistantWorkerModelsResponse {
  models: Record<AssistantWorkerProvider, string[]>;
}

@Controller()
export class AssistantWorkerRootController {
  constructor(
    private readonly assistantWorkerConfigService: AssistantWorkerConfigService,
    private readonly assistantLlmProviderStatusService: AssistantLlmProviderStatusService,
    private readonly ollamaProviderStatusService: OllamaProviderStatusService,
    private readonly assistantToolCatalogService: AssistantToolCatalogService,
    private readonly conversationService: AssistantWorkerConversationService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getRoot(): Promise<string> {
    const config = await this.assistantWorkerConfigService.read();
    const providerStatus = await this.assistantLlmProviderStatusService.getStatus();
    const providerModels = await this.providerModels(config);
    const skills = await this.listLocalSkillFiles();
    const conversations = await this.safeListConversations();

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
    <link
      href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
      rel="stylesheet"
      integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH"
      crossorigin="anonymous"
    />
    <style>
      :root {
        color-scheme: light;
        --chat-bg: #f4f7fb;
        --chat-surface: #ffffff;
        --chat-surface-2: #f6f8fb;
        --chat-line: #d8e0ea;
        --chat-ink: #172033;
        --chat-muted: #64748b;
        --chat-accent: #0f5ea8;
        --chat-success: #0f766e;
        --chat-warning: #b45309;
        --chat-danger: #b91c1c;
        font-family: "Manrope", sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(15, 94, 168, 0.08), transparent 28%),
          linear-gradient(180deg, #f4f7fb 0%, #eef2f7 100%);
        color: var(--chat-ink);
      }
      body, button, input, select, textarea {
        font-family: "Manrope", sans-serif;
      }
      main {
        max-width: 1120px;
        margin: 0 auto;
        padding: 24px 16px 32px;
      }
      .panel {
        border: 1px solid var(--chat-line);
        border-radius: 18px;
        background: var(--chat-surface);
        padding: 24px;
        box-shadow:
          0 10px 30px rgba(23, 32, 51, 0.06);
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
      .form-label {
        color: var(--chat-ink);
        font-weight: 600;
      }
      .form-control,
      .form-select {
        background: var(--chat-surface-2);
        color: var(--chat-ink);
        border: 1px solid var(--chat-line);
        border-radius: 10px;
        padding: 12px 14px;
      }
      .form-control:focus,
      .form-select:focus {
        background: var(--chat-surface-2);
        color: var(--chat-ink);
        border-color: rgba(15, 94, 168, 0.35);
        box-shadow: 0 0 0 0.2rem rgba(15, 94, 168, 0.12);
      }
      .btn-worker-primary {
        border: 0;
        border-radius: 10px;
        padding: 12px 18px;
        background: #172033;
        color: #ffffff;
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
        padding: 18px;
        border-radius: 16px;
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
      .worker-menu .nav-link {
        border-radius: 12px;
        color: var(--chat-muted);
        text-align: left;
        font-weight: 700;
        padding: 12px 14px;
        background: transparent;
        border: 1px solid transparent;
      }
      .worker-menu .menu-label {
        margin: 12px 0 8px;
        padding: 0 14px;
        font-size: 12px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--chat-muted);
      }
      .worker-menu .nav-link.subitem {
        margin-left: 14px;
        width: calc(100% - 14px);
        font-weight: 600;
      }
      .worker-menu .nav-link:hover {
        color: var(--chat-ink);
        background: rgba(23, 32, 51, 0.04);
      }
      .worker-menu .nav-link.active {
        color: #ffffff;
        background: var(--chat-accent);
        border-color: rgba(15, 94, 168, 0.35);
      }
      .tab-pane {
        display: none;
      }
      .tab-pane.active.show {
        display: block;
      }
      .tool-item {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 14px;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.65);
        border: 1px solid var(--chat-line);
      }
      .tool-item + .tool-item {
        margin-top: 12px;
      }
      .tool-item input[type="checkbox"] {
        margin-top: 4px;
      }
      .tool-title {
        display: block;
        font-size: 14px;
        font-weight: 700;
        color: var(--chat-ink);
      }
      .tool-description {
        display: block;
        margin-top: 4px;
        color: var(--chat-muted);
        font-size: 13px;
        line-height: 1.45;
      }
      .status-grid {
        margin-top: 20px;
        display: grid;
        gap: 12px;
      }
      .status-card {
        padding: 14px 16px;
        border-radius: 16px;
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
        background: rgba(15, 118, 110, 0.12);
        color: var(--chat-success);
      }
      .status-pill.error {
        background: rgba(185, 28, 28, 0.12);
        color: var(--chat-danger);
      }
      .status-pill.missing_key {
        background: rgba(180, 83, 9, 0.12);
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
          <div class="row g-4">
            <div class="col-lg-3">
              <div class="nav flex-column nav-pills worker-menu" id="worker-settings-menu" role="tablist" aria-orientation="vertical">
                <button class="nav-link active" id="menu-general-tab" data-bs-toggle="pill" data-bs-target="#menu-general" type="button" role="tab" aria-controls="menu-general" aria-selected="true">General</button>
                <div class="menu-label">LLMs</div>
                <button class="nav-link subitem" id="menu-ollama-tab" data-bs-toggle="pill" data-bs-target="#menu-ollama" type="button" role="tab" aria-controls="menu-ollama" aria-selected="false">Ollama</button>
                <button class="nav-link subitem" id="menu-deepseek-tab" data-bs-toggle="pill" data-bs-target="#menu-deepseek" type="button" role="tab" aria-controls="menu-deepseek" aria-selected="false">DeepSeek</button>
                <button class="nav-link subitem" id="menu-xai-tab" data-bs-toggle="pill" data-bs-target="#menu-xai" type="button" role="tab" aria-controls="menu-xai" aria-selected="false">XAI</button>
                <button class="nav-link" id="menu-tools-tab" data-bs-toggle="pill" data-bs-target="#menu-tools" type="button" role="tab" aria-controls="menu-tools" aria-selected="false">Tools</button>
                <div class="menu-label">Integrations</div>
                <button class="nav-link subitem" id="menu-brave-tab" data-bs-toggle="pill" data-bs-target="#menu-brave" type="button" role="tab" aria-controls="menu-brave" aria-selected="false">Brave</button>
                <button class="nav-link" id="menu-skills-tab" data-bs-toggle="pill" data-bs-target="#menu-skills" type="button" role="tab" aria-controls="menu-skills" aria-selected="false">Skills</button>
              </div>
            </div>
            <div class="col-lg-9">
              <div class="tab-content">
                <div class="tab-pane fade show active" id="menu-general" role="tabpanel" aria-labelledby="menu-general-tab" tabindex="0">
                  <div class="config-group">
                    <h2>General</h2>
                    <p>Main runtime settings and shared provider defaults. xAI is configured here.</p>
                    <div class="row g-3">
                      <div class="col-md-6">
                        <label class="form-label" for="provider">LLM provider</label>
                        <select class="form-select" id="provider" name="provider">
                          <option value="deepseek"${config.provider === 'deepseek' ? ' selected' : ''}>deepseek</option>
                          <option value="xai"${config.provider === 'xai' ? ' selected' : ''}>xai</option>
                          <option value="ollama"${config.provider === 'ollama' ? ' selected' : ''}>ollama</option>
                        </select>
                      </div>
                      <div class="col-md-6">
                        <label class="form-label" for="model">Model</label>
                        <select class="form-select" id="model" name="model">${this.renderModelOptions(
                          providerModels[config.provider] ?? [config.model],
                          config.model,
                        )}</select>
                      </div>
                      <div class="col-md-4">
                        <label class="form-label" for="memory-window">Remember messages</label>
                        <input
                          class="form-control"
                          id="memory-window"
                          name="memory_window"
                          type="number"
                          min="1"
                          max="20"
                          value="${String(config.memory_window)}"
                        />
                      </div>
                      <div class="col-md-4">
                        <label class="form-label" for="thinking-interval-seconds">run.thinking interval (seconds)</label>
                        <input
                          class="form-control"
                          id="thinking-interval-seconds"
                          name="thinking_interval_seconds"
                          type="number"
                          min="1"
                          max="30"
                          value="${String(config.thinking_interval_seconds)}"
                        />
                      </div>
                      <div class="col-md-4">
                        <label class="form-label" for="run-timeout-seconds">Run timeout (seconds)</label>
                        <input
                          class="form-control"
                          id="run-timeout-seconds"
                          name="run_timeout_seconds"
                          type="number"
                          min="5"
                          max="600"
                          value="${String(config.run_timeout_seconds)}"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div class="tab-pane fade" id="menu-ollama" role="tabpanel" aria-labelledby="menu-ollama-tab" tabindex="0">
                  <div class="config-group">
                    <h2>Ollama</h2>
                    <p>Used when provider is <code>ollama</code>.</p>
                    <div class="row g-3">
                      <div class="col-md-8">
                        <label class="form-label" for="ollama-base-url">Base URL</label>
                        <input class="form-control" id="ollama-base-url" name="ollama_base_url" type="url" value="${this.escapeHtml(config.ollama_base_url)}" />
                      </div>
                      <div class="col-md-4">
                        <label class="form-label" for="ollama-timeout-ms">Timeout (ms)</label>
                        <input class="form-control" id="ollama-timeout-ms" name="ollama_timeout_ms" type="number" min="1000" max="3600000" value="${String(config.ollama_timeout_ms)}" />
                      </div>
                      <div class="col-12">
                        <div class="tool-item">
                          <span>
                            <strong class="tool-title">Available local models</strong>
                            <span class="tool-description">${this.renderOllamaModels(providerModels.ollama)}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="tab-pane fade" id="menu-deepseek" role="tabpanel" aria-labelledby="menu-deepseek-tab" tabindex="0">
                  <div class="config-group">
                    <h2>DeepSeek</h2>
                    <p>Used when provider is <code>deepseek</code>.</p>
                    <div class="row g-3">
                      <div class="col-12">
                        <label class="form-label" for="deepseek-api-key">API key</label>
                        <input class="form-control" id="deepseek-api-key" name="deepseek_api_key" type="password" value="${this.escapeHtml(config.deepseek_api_key)}" />
                      </div>
                      <div class="col-md-8">
                        <label class="form-label" for="deepseek-base-url">Base URL</label>
                        <input class="form-control" id="deepseek-base-url" name="deepseek_base_url" type="url" value="${this.escapeHtml(config.deepseek_base_url)}" />
                      </div>
                      <div class="col-md-4">
                        <label class="form-label" for="deepseek-timeout-ms">Timeout (ms)</label>
                        <input class="form-control" id="deepseek-timeout-ms" name="deepseek_timeout_ms" type="number" min="1000" max="3600000" value="${String(config.deepseek_timeout_ms)}" />
                      </div>
                    </div>
                  </div>
                </div>
                <div class="tab-pane fade" id="menu-xai" role="tabpanel" aria-labelledby="menu-xai-tab" tabindex="0">
                  <div class="config-group">
                    <h2>XAI</h2>
                    <p>Used when provider is <code>xai</code>.</p>
                    <div class="row g-3">
                      <div class="col-12">
                        <label class="form-label" for="xai-api-key">API key</label>
                        <input class="form-control" id="xai-api-key" name="xai_api_key" type="password" value="${this.escapeHtml(config.xai_api_key)}" />
                      </div>
                      <div class="col-md-8">
                        <label class="form-label" for="xai-base-url">Base URL</label>
                        <input class="form-control" id="xai-base-url" name="xai_base_url" type="url" value="${this.escapeHtml(config.xai_base_url)}" />
                      </div>
                      <div class="col-md-4">
                        <label class="form-label" for="xai-timeout-ms">Timeout (ms)</label>
                        <input class="form-control" id="xai-timeout-ms" name="xai_timeout_ms" type="number" min="1000" max="3600000" value="${String(config.xai_timeout_ms)}" />
                      </div>
                    </div>
                  </div>
                </div>
                <div class="tab-pane fade" id="menu-tools" role="tabpanel" aria-labelledby="menu-tools-tab" tabindex="0">
                  <div class="config-group">
                    <h2>Tools</h2>
                    <p>Select which model-callable tools are available in the assistant runtime.</p>
                    <div class="row g-3">
                      <div class="col-12">
                        ${this.renderToolCheckboxes(config.enabled_tools)}
                      </div>
                    </div>
                  </div>
                </div>
                <div class="tab-pane fade" id="menu-brave" role="tabpanel" aria-labelledby="menu-brave-tab" tabindex="0">
                  <div class="config-group">
                    <h2>Brave</h2>
                    <p>Settings for the <code>web_search</code> tool and Brave Search API integration.</p>
                    <div class="row g-3">
                      <div class="col-12">
                        <label class="form-label" for="brave-api-key">API key</label>
                        <input class="form-control" id="brave-api-key" name="brave_api_key" type="password" value="${this.escapeHtml(config.brave_api_key)}" />
                      </div>
                      <div class="col-md-8">
                        <label class="form-label" for="brave-base-url">Base URL</label>
                        <input class="form-control" id="brave-base-url" name="brave_base_url" type="url" value="${this.escapeHtml(config.brave_base_url)}" />
                      </div>
                      <div class="col-md-4">
                        <label class="form-label" for="brave-timeout-ms">Timeout (ms)</label>
                        <input class="form-control" id="brave-timeout-ms" name="brave_timeout_ms" type="number" min="1000" max="3600000" value="${String(config.brave_timeout_ms)}" />
                      </div>
                    </div>
                  </div>
                </div>
                <div class="tab-pane fade" id="menu-skills" role="tabpanel" aria-labelledby="menu-skills-tab" tabindex="0">
                  <div class="config-group">
                    <h2>Skills</h2>
                    <p>Local runtime skill files available in <code>runtime/assistant-worker/skills/</code>.</p>
                    ${this.renderSkillsList(skills)}
                  </div>
                </div>
              </div>
              <div class="d-flex justify-content-end mt-3">
                <button class="btn btn-worker-primary" type="submit">Save settings</button>
              </div>
            </div>
          </div>
        </form>
        <div id="status"></div>
        <div class="status-grid">
          <div class="status-card">
            <strong>provider status</strong>
            <div>Selected provider: <span id="provider-value">${this.escapeHtml(config.provider)}</span></div>
            <div>Selected model: <span id="selected-model-value">${this.escapeHtml(config.model)}</span></div>
            <div>Memory window: <span id="memory-window-value">${String(config.memory_window)}</span></div>
            <div>Thinking interval: <span id="thinking-interval-value">${String(config.thinking_interval_seconds)}</span>s</div>
            <div>Enabled tools: <span id="enabled-tools-value">${this.escapeHtml(config.enabled_tools.join(', '))}</span></div>
            <div>Provider id: <span id="provider-id">${this.escapeHtml(providerStatus.provider)}</span></div>
            <div>Configured model: <span id="provider-model">${this.escapeHtml(providerStatus.model)}</span></div>
            <div>Credential: <span id="provider-credential">${this.renderCredential(providerStatus)}</span></div>
            <div>Reachability: <span id="provider-reachable">${providerStatus.reachable ? 'working' : 'not working'}</span></div>
            <div>Details: <span id="provider-message">${this.escapeHtml(providerStatus.message)}</span></div>
            <span id="provider-status-pill" class="status-pill ${providerStatus.status}">${this.escapeHtml(providerStatus.status)}</span>
          </div>
          <div class="status-card">
            <strong>conversation threads</strong>
            ${this.renderConversationList(conversations)}
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
        const enabledTools = Array.from(document.querySelectorAll('input[name="enabled_tools"]:checked'))
          .map((field) => field.value);
        const braveApiKey = document.getElementById('brave-api-key').value;
        const braveBaseUrl = document.getElementById('brave-base-url').value;
        const braveTimeoutMs = document.getElementById('brave-timeout-ms').value;
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
            brave_api_key: braveApiKey,
            brave_base_url: braveBaseUrl,
            brave_timeout_ms: braveTimeoutMs,
            deepseek_api_key: deepseekApiKey,
            deepseek_base_url: deepseekBaseUrl,
            deepseek_timeout_ms: deepseekTimeoutMs,
            enabled_tools: enabledTools,
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
        status.textContent = 'Saved provider: ' + payload.provider + ', model: ' + payload.model + ', memory window: ' + payload.memory_window + ', thinking interval: ' + payload.thinking_interval_seconds + 's, run timeout: ' + payload.run_timeout_seconds + 's, enabled tools: ' + payload.enabled_tools.join(', ');
        document.getElementById('provider-value').textContent = payload.provider;
        document.getElementById('selected-model-value').textContent = payload.model;
        document.getElementById('provider').value = payload.provider;
        renderModelOptions(payload.provider, payload.model);
        document.getElementById('memory-window-value').textContent = String(payload.memory_window);
        document.getElementById('memory-window').value = String(payload.memory_window);
        document.getElementById('thinking-interval-value').textContent = String(payload.thinking_interval_seconds);
        document.getElementById('thinking-interval-seconds').value = String(payload.thinking_interval_seconds);
        document.getElementById('enabled-tools-value').textContent = payload.enabled_tools.join(', ');
        document.querySelectorAll('input[name="enabled_tools"]').forEach((field) => {
          field.checked = payload.enabled_tools.includes(field.value);
        });
        document.getElementById('run-timeout-seconds').value = String(payload.run_timeout_seconds);
        document.getElementById('brave-api-key').value = payload.brave_api_key;
        document.getElementById('brave-base-url').value = payload.brave_base_url;
        document.getElementById('brave-timeout-ms').value = String(payload.brave_timeout_ms);
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
    <script
      src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"
      integrity="sha384-YvpcrYf0tY3lHB60NNkmXc5s9fDVZLESaAA55NDzOxhy9GkcIdslK1eN7N6jIeHz"
      crossorigin="anonymous"
    ></script>
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

  @Get('models')
  async getModels(): Promise<AssistantWorkerModelsResponse> {
    const config = await this.assistantWorkerConfigService.read();
    return {
      models: await this.providerModels(config),
    };
  }

  @Get('skills')
  async getSkills(): Promise<{ skills: string[] }> {
    return {
      skills: await this.listLocalSkillFiles(),
    };
  }

  @Put('config')
  async updateConfig(@Body() body: UpdateWorkerConfigBody): Promise<AssistantWorkerConfig> {
    const provider = this.normalizeProvider(body.provider);

    return this.assistantWorkerConfigService.write({
      brave_api_key:
        typeof body.brave_api_key === 'string' ? body.brave_api_key : '',
      brave_base_url:
        typeof body.brave_base_url === 'string' ? body.brave_base_url : '',
      brave_timeout_ms:
        typeof body.brave_timeout_ms === 'number'
          ? body.brave_timeout_ms
          : typeof body.brave_timeout_ms === 'string'
            ? Number.parseInt(body.brave_timeout_ms, 10)
            : 30000,
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
      enabled_tools: this.normalizeEnabledTools(body.enabled_tools),
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

  private normalizeEnabledTools(value: unknown): AssistantToolName[] {
    if (Array.isArray(value)) {
      const normalized = value.filter((entry): entry is AssistantToolName =>
        this.assistantToolCatalogService.isSupportedToolName(entry),
      );
      return [...new Set(normalized)];
    }

    return this.assistantToolCatalogService.listToolNames();
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

  private renderToolCheckboxes(selectedTools: AssistantToolName[]): string {
    const selectedSet = new Set(selectedTools);

    return this.assistantToolCatalogService
      .listTools()
      .map(
        (tool) => `<label class="tool-item">
  <input type="checkbox" name="enabled_tools" value="${this.escapeHtml(tool.name)}"${
    selectedSet.has(tool.name) ? ' checked' : ''
  } />
  <span>
    <strong class="tool-title">${this.escapeHtml(tool.name)}</strong>
    <span class="tool-description">${this.escapeHtml(tool.description)}</span>
  </span>
</label>`,
      )
      .join('');
  }

  private renderSkillsList(skills: string[]): string {
    if (skills.length === 0) {
      return '<div class="tool-item"><span><strong class="tool-title">No local skills</strong><span class="tool-description">Add files to runtime/assistant-worker/skills/ to make them visible here.</span></span></div>';
    }

    return skills
      .map(
        (skill) => `<div class="tool-item"><span><strong class="tool-title">${this.escapeHtml(skill)}</strong><span class="tool-description">Runtime skill definition file</span></span></div>`,
      )
      .join('');
  }

  private renderOllamaModels(models: string[]): string {
    const filtered = models.filter((model) => model.trim().length > 0);

    if (filtered.length === 0) {
      return 'No local models detected from the Ollama API yet.';
    }

    return filtered.map((model) => this.escapeHtml(model)).join(', ');
  }

  private async listLocalSkillFiles(): Promise<string[]> {
    const skillsDirectory = join(dirname(dirname(this.assistantWorkerConfigService.configPath())), 'skills');

    try {
      const entries = await readdir(skillsDirectory, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && entry.name !== 'README.md')
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return [];
      }

      throw error;
    }
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

  private renderConversationList(conversations: AssistantConversationThreadListItem[]): string {
    if (conversations.length === 0) {
      return '<div>No conversation threads yet.</div>';
    }

    return conversations
      .slice(0, 12)
      .map(
        (conversation) =>
          `<div class="mb-2"><code>${this.escapeHtml(
            conversation.thread_id,
          )}</code> · ${this.escapeHtml(conversation.direction)}/${this.escapeHtml(
            conversation.chat,
          )}/${this.escapeHtml(conversation.contact)} · ${this.escapeHtml(
            conversation.updated_at ?? 'n/a',
          )}</div>`,
      )
      .join('');
  }

  private async safeListConversations(): Promise<AssistantConversationThreadListItem[]> {
    try {
      return await this.conversationService.listConversations();
    } catch {
      return [];
    }
  }
}
