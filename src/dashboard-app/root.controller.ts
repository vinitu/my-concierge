import { Controller, Get, Header } from "@nestjs/common";
import { DashboardMetricsService } from "./observability/dashboard-metrics.service";
import { DashboardStatusService } from "./dashboard-status.service";

@Controller()
export class DashboardRootController {
  constructor(
    private readonly dashboardMetricsService: DashboardMetricsService,
    private readonly dashboardStatusService: DashboardStatusService,
  ) {}

  @Get()
  @Header("Content-Type", "text/html; charset=utf-8")
  getRoot(): string {
    this.dashboardMetricsService.recordEndpointRequest("/");

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>dashboard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <link
      href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
      rel="stylesheet"
      integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH"
      crossorigin="anonymous"
    />
    <style>
      :root {
        color-scheme: light;
        --ink: #172033;
        --muted: #64748b;
        --line: #d8e0ea;
        --surface: #ffffff;
        --surface-2: #f4f7fb;
        --ok: #0f766e;
        --warn: #a16207;
        --down: #b91c1c;
        font-family: "Manrope", sans-serif;
      }
      body {
        margin: 0;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(15, 118, 110, 0.08), transparent 28%),
          linear-gradient(180deg, #f4f7fb 0%, #eef2f7 100%);
      }
      .layout {
        display: grid;
        grid-template-columns: 280px 1fr;
        min-height: 100vh;
      }
      aside {
        border-right: 1px solid var(--line);
        background: var(--surface);
        padding: 18px;
        display: flex;
        flex-direction: column;
      }
      .brand { font-size: 24px; font-weight: 800; margin: 0 0 8px; }
      .sub { font-size: 13px; color: var(--muted); margin: 0 0 16px; }
      .menu { display: grid; gap: 8px; }
      .menu button {
        text-align: left;
        border: 1px solid var(--line);
        background: var(--surface-2);
        border-radius: 12px;
        padding: 10px 12px;
        cursor: pointer;
        font-weight: 700;
        color: var(--ink);
      }
      .menu button.active { border-color: #0f5ea8; box-shadow: inset 0 0 0 1px #0f5ea8; }
      .submenu {
        display: grid;
        gap: 6px;
        margin: -2px 0 4px 14px;
      }
      .submenu button {
        padding: 8px 10px;
        border-radius: 10px;
        font-size: 13px;
        background: #fff;
      }
      main { padding: 18px; }
      .meta { margin-top: 8px; color: var(--muted); font-size: 13px; }
      .panel {
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 16px;
        background: var(--surface);
      }
      .subtabs {
        display: flex;
        gap: 8px;
        margin: 8px 0 12px;
        flex-wrap: wrap;
        list-style: none;
        padding: 0;
      }
      .subtabs a {
        display: inline-flex;
        align-items: center;
        border: 1px solid var(--line);
        background: #fff;
        border-radius: 8px;
        padding: 8px 10px;
        font-weight: 700;
        text-decoration: none;
        color: var(--ink);
      }
      .subtabs a.active { border-color: #0f5ea8; box-shadow: inset 0 0 0 1px #0f5ea8; }
      .subtabs a.disabled {
        opacity: 0.7;
        cursor: default;
        pointer-events: none;
      }
      .section-title { margin: 0 0 6px; font-size: 22px; }
      .description { margin: 0 0 14px; color: var(--muted); }
      .list { display: grid; gap: 8px; }
      .item {
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 10px;
        background: var(--surface-2);
      }
      form { display: grid; gap: 10px; }
      label { display: grid; gap: 6px; font-weight: 600; }
      input, select, textarea {
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 10px;
        background: #fff;
        font: inherit;
      }
      textarea { min-height: 90px; }
      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .actions { margin-top: 10px; display: flex; gap: 10px; }
      .actions button, .actions a {
        border: 0;
        border-radius: 10px;
        padding: 10px 14px;
        cursor: pointer;
        color: #fff;
        font-weight: 700;
        background: #172033;
        text-decoration: none;
      }
      .status-line { margin-top: 8px; color: var(--muted); min-height: 20px; }
      .embedded-chat {
        width: 100%;
        min-height: 84vh;
        height: calc(100vh - 170px);
        border: 1px solid var(--line);
        border-radius: 12px;
        background: #fff;
      }
      pre {
        margin: 0;
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 10px;
        background: #0f172a;
        color: #e2e8f0;
        overflow: auto;
      }
      @media (max-width: 980px) {
        .layout { grid-template-columns: 1fr; }
        aside { border-right: 0; border-bottom: 1px solid var(--line); }
        .row { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="layout">
      <aside>
        <h1 class="brand">dashboard</h1>
        <p class="sub">Unified panel for all services.</p>
        <div class="menu" id="service-menu"></div>
        <div class="actions" style="margin-top: 14px;">
          <a href="/metrics">Metrics</a>
          <a href="/openapi.json">OpenAPI</a>
        </div>
      </aside>
      <main>
        <section class="panel">
          <h2 id="service-title" class="section-title"></h2>
          <p id="service-description" class="description"></p>
          <div id="service-content"></div>
        </section>
      </main>
    </div>
    <script>
      const ASSISTANT_ORCHESTRATOR_TOOL_NAMES = [
        'time_current',
        'web_search',
        'memory_search',
        'memory_fact_search',
        'memory_fact_write',
        'memory_conversation_search',
        'skill_execute',
      ];
      const GATEWAY_WEB_INCOMING_MESSAGE_TYPES = [
        { group: 'Response', value: 'response.message', description: 'Assistant response message' },
        { group: 'Response', value: 'response.error', description: 'Assistant error response' },
        { group: 'Response', value: 'response.thinking', description: 'Thinking progress update' },
        { group: 'Fact', value: 'memory.fact.added', description: 'Added fact to memory' },
        { group: 'Fact', value: 'memory.fact.updated', description: 'Updated fact in memory' },
        { group: 'Fact', value: 'memory.fact.deleted', description: 'Deleted fact from memory' },
        { group: 'Fact', value: 'memory.fact.readed', description: 'Read fact from memory' },
        { group: 'Fact', value: 'memory.fact.failed', description: 'Failed fact memory operation' },
        { group: 'Profile', value: 'memory.profile.updated', description: 'Updated profile in memory' },
        { group: 'Profile', value: 'memory.profile.failed', description: 'Failed profile memory operation' },
      ];
      const ASSISTANT_MEMORY_SECTIONS = [
        { id: 'settings', label: 'Settings' },
        { id: 'profile', label: 'Profile' },
        { id: 'conversations', label: 'Conversations' },
        { id: 'facts', label: 'Facts' },
      ];
      const state = {
        services: [],
        selectedService: null,
        selectedSection: 'general',
        currentConfig: null,
        assistantLlmTab: 'ollama',
      };

      function escapeHtml(value) {
        return String(value)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');
      }

      function trimTrailingSlash(value) {
        return typeof value === 'string' && value.endsWith('/') ? value.slice(0, -1) : value;
      }

      function buildServiceUrl(service, path) {
        const panelBase = trimTrailingSlash(service?.panel_url || '');
        const upstreamBase = trimTrailingSlash(service?.upstream_url || '');
        const base = panelBase || upstreamBase;

        if (!base) {
          throw new Error('service url is not configured');
        }

        const normalizedPath = path.startsWith('/') ? path : '/' + path;
        return base + normalizedPath;
      }

      async function loadCatalog() {
        const response = await fetch('/services/catalog');
        const payload = await response.json();
        state.services = payload.services.filter((service) => service.kind === 'application');
        if (!state.selectedService && state.services.length > 0) {
          state.selectedService = state.services[0].key;
        }
      }

      function allowedSectionsForService(serviceKey) {
        if (serviceKey === 'assistant-orchestrator') {
          return ['settings', 'tools', 'skills', 'integrations'];
        }
        if (serviceKey === 'assistant-llm') {
          return ['provider', 'llms'];
        }
        if (serviceKey === 'assistant-memory') {
          return ASSISTANT_MEMORY_SECTIONS.map((item) => item.id);
        }
        if (serviceKey === 'gateway-web') {
          return ['settings', 'chat'];
        }
        return ['general'];
      }

      function parseHash() {
        const raw = window.location.hash.replace(/^#/, '').trim();
        if (!raw) {
          return null;
        }
        const params = new URLSearchParams(raw);
        const service = params.get('service');
        const section = params.get('section');
        if (!service) {
          return null;
        }
        return { section, service };
      }

      function isKnownService(serviceKey) {
        return state.services.some((entry) => entry.key === serviceKey);
      }

      function normalizeSection(serviceKey, section) {
        const allowed = allowedSectionsForService(serviceKey);
        if (typeof section === 'string' && allowed.includes(section)) {
          return section;
        }
        return defaultSectionForService(serviceKey);
      }

      function applyHashState() {
        const parsed = parseHash();
        if (!parsed || !isKnownService(parsed.service)) {
          if (!state.selectedService && state.services.length > 0) {
            state.selectedService = state.services[0].key;
          }
          if (state.selectedService) {
            state.selectedSection = defaultSectionForService(state.selectedService);
          }
          return false;
        }

        state.selectedService = parsed.service;
        state.selectedSection = normalizeSection(parsed.service, parsed.section);
        return true;
      }

      function updateHashFromState() {
        if (!state.selectedService) {
          return;
        }
        const normalizedSection = normalizeSection(
          state.selectedService,
          state.selectedSection,
        );
        const next = '#service=' + encodeURIComponent(state.selectedService) +
          '&section=' + encodeURIComponent(normalizedSection);
        if (window.location.hash !== next) {
          window.location.hash = next;
        }
      }

      function navigateTo(serviceKey, section) {
        state.selectedService = serviceKey;
        state.selectedSection = normalizeSection(serviceKey, section);
        state.currentConfig = null;
        updateHashFromState();
        renderMenu();
        void renderService();
      }

      function renderMenu() {
        const menu = document.getElementById('service-menu');
        menu.innerHTML = state.services.map((service) => {
          const active = service.key === state.selectedService ? 'active' : '';
          const serviceButton = '<button class="' + active + '" data-key="' + escapeHtml(service.key) + '">' + escapeHtml(service.name) + '</button>';
          if (service.key === 'assistant-orchestrator' && service.key === state.selectedService) {
            const subItems = [
              { id: 'settings', label: 'Settings' },
              { id: 'tools', label: 'Tools' },
              { id: 'skills', label: 'Skills' },
              { id: 'integrations', label: 'Integrations' },
            ];
            const submenu = '<div class="submenu">' + subItems.map((item) => {
              const subActive = item.id === state.selectedSection ? 'active' : '';
              return '<button class="' + subActive + '" data-section="' + escapeHtml(item.id) + '">' + escapeHtml(item.label) + '</button>';
            }).join('') + '</div>';
            return serviceButton + submenu;
          }
          if (service.key === 'assistant-llm' && service.key === state.selectedService) {
            const subItems = [
              { id: 'provider', label: 'Provider' },
              { id: 'llms', label: 'LLMs' },
            ];
            const submenu = '<div class="submenu">' + subItems.map((item) => {
              const subActive = item.id === state.selectedSection ? 'active' : '';
              return '<button class="' + subActive + '" data-section="' + escapeHtml(item.id) + '">' + escapeHtml(item.label) + '</button>';
            }).join('') + '</div>';
            return serviceButton + submenu;
          }
          if (service.key === 'assistant-memory' && service.key === state.selectedService) {
            const submenu = '<div class="submenu">' + ASSISTANT_MEMORY_SECTIONS.map((item) => {
              const subActive = item.id === state.selectedSection ? 'active' : '';
              return '<button class="' + subActive + '" data-section="' + escapeHtml(item.id) + '">' + escapeHtml(item.label) + '</button>';
            }).join('') + '</div>';
            return serviceButton + submenu;
          }
          if (service.key === 'gateway-web' && service.key === state.selectedService) {
            const subItems = [
              { id: 'settings', label: 'Settings' },
              { id: 'chat', label: 'Chat' },
            ];
            const submenu = '<div class="submenu">' + subItems.map((item) => {
              const subActive = item.id === state.selectedSection ? 'active' : '';
              return '<button class="' + subActive + '" data-section="' + escapeHtml(item.id) + '">' + escapeHtml(item.label) + '</button>';
            }).join('') + '</div>';
            return serviceButton + submenu;
          }
          return serviceButton;
        }).join('');
        menu.querySelectorAll('button[data-key]').forEach((button) => {
          button.addEventListener('click', () => {
            navigateTo(
              button.dataset.key,
              defaultSectionForService(button.dataset.key),
            );
          });
        });
        menu.querySelectorAll('button[data-section]').forEach((button) => {
          button.addEventListener('click', () => {
            navigateTo(state.selectedService, button.dataset.section);
          });
        });
      }

      function defaultSectionForService(serviceKey) {
        if (serviceKey === 'assistant-orchestrator') return 'settings';
        if (serviceKey === 'assistant-llm') return 'provider';
        if (serviceKey === 'assistant-memory') return 'profile';
        if (serviceKey === 'gateway-web') return 'settings';
        return 'general';
      }

      async function renderService() {
        const service = state.services.find((entry) => entry.key === state.selectedService);
        if (!service) return;

        const serviceTitle = document.getElementById('service-title');
        const serviceDescription = document.getElementById('service-description');
        const isGatewayWebChat =
          service.key === 'gateway-web' && state.selectedSection === 'chat';

        if (isGatewayWebChat) {
          serviceTitle.textContent = '';
          serviceDescription.textContent = '';
          serviceTitle.style.display = 'none';
          serviceDescription.style.display = 'none';
        } else {
          serviceTitle.textContent = service.name;
          serviceDescription.textContent = service.notes;
          serviceTitle.style.display = '';
          serviceDescription.style.display = '';
        }

        const content = document.getElementById('service-content');
        if (service.key === 'assistant-memory') {
          await renderAssistantMemorySection(service, state.selectedSection);
          return;
        }

        if (service.key === 'assistant-orchestrator' && state.selectedSection === 'settings') {
          await renderSettingsTab(service);
          return;
        }

        if (service.key === 'assistant-orchestrator' && state.selectedSection === 'tools') {
          await renderAssistantOrchestratorTools(service);
          return;
        }

        if (service.key === 'assistant-orchestrator' && state.selectedSection === 'skills') {
          await renderAssistantOrchestratorSkills(service);
          return;
        }

        if (service.key === 'assistant-orchestrator' && state.selectedSection === 'integrations') {
          await renderAssistantOrchestratorIntegrations(service);
          return;
        }

        if (service.key === 'assistant-llm' && state.selectedSection === 'provider') {
          await renderAssistantLlmProvider(service);
          return;
        }

        if (service.key === 'assistant-llm' && state.selectedSection === 'llms') {
          await renderAssistantLlmConnections(service);
          return;
        }

        if (service.key === 'gateway-web' && state.selectedSection === 'settings') {
          await renderGatewayWebSettings(service);
          return;
        }

        if (service.key === 'gateway-web' && state.selectedSection === 'chat') {
          content.innerHTML =
            '<iframe class="embedded-chat" src="' + escapeHtml((service.prefix || '') + '/') + '" title="gateway-web chat"></iframe>';
          return;
        }

        if (state.selectedSection === 'general') {
          content.innerHTML = '<div class="list">' +
            '<div class="item"><strong>Prefix:</strong> <code>' + escapeHtml(service.prefix || '-') + '</code></div>' +
            '<div class="item"><strong>Status endpoint:</strong> <code>' + escapeHtml(service.status_url || 'not exposed') + '</code></div>' +
            '<div class="actions"><a href="' + escapeHtml(service.prefix || '/') + '">Open service panel via dashboard prefix</a></div>' +
          '</div>';
          if (service.config_path && service.key !== 'gateway-web') {
            if (service.key === 'gateway-email') {
              await renderGatewayEmailSettings(service);
            } else {
              await renderSettingsTab(service);
            }
          }
          if (service.key !== 'assistant-orchestrator' && service.entities.length > 0) {
            const entitiesHtml = service.entities.map((entity) =>
              '<div class="item"><strong>' + escapeHtml(entity.label) + '</strong><div class="actions"><a href="#" data-open-entity="' + escapeHtml(entity.id) + '">Open</a></div></div>',
            ).join('');
            content.innerHTML += '<div class="list" style="margin-top:10px">' + entitiesHtml + '</div>';
            content.querySelectorAll('a[data-open-entity]').forEach((link) => {
              link.addEventListener('click', async (event) => {
                event.preventDefault();
                const entityId = link.dataset.openEntity;
                await renderEntityTab(service, entityId);
              });
            });
          }
          return;
        }

      }

      async function renderSettingsTab(service) {
        const content = document.getElementById('service-content');
        content.innerHTML = '<div class="status-line">Loading settings...</div>';
        const response = await fetch(buildServiceUrl(service, service.config_path || '/config'));
        if (!response.ok) {
          content.innerHTML = '<div class="status-line">Failed to load settings</div>';
          return;
        }
        const config = await response.json();
        state.currentConfig = config;
        const keys = editableConfigKeys(service.key, config);

        if (keys.length === 0) {
          content.innerHTML = '<div class="status-line">No editable settings in this section</div>';
          return;
        }

        content.innerHTML = '<form id="settings-form">' +
          keys.map((key) => renderField(key, config[key])).join('') +
          '<div class="actions"><button type="submit">Save settings</button></div>' +
          '<div id="settings-status" class="status-line"></div>' +
        '</form>';

        const form = document.getElementById('settings-form');
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const payload = {};
          for (const key of keys) {
            payload[key] = readFieldValue(key, state.currentConfig[key]);
          }
          const status = document.getElementById('settings-status');
          status.textContent = 'Saving...';
          const putResponse = await fetch(buildServiceUrl(service, service.config_path || '/config'), {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });
          status.textContent = putResponse.ok ? 'Saved' : 'Failed to save';
        });
      }

      function editableConfigKeys(serviceKey, config) {
        if (serviceKey === 'assistant-orchestrator') {
          return ['memory_window', 'run_timeout_seconds', 'thinking_interval_seconds']
            .filter((key) => Object.prototype.hasOwnProperty.call(config, key));
        }
        return Object.keys(config);
      }

      async function ensureServiceConfig(service) {
        if (state.currentConfig) {
          return state.currentConfig;
        }
        const response = await fetch(buildServiceUrl(service, service.config_path || '/config'));
        if (!response.ok) {
          throw new Error('failed to load config');
        }
        state.currentConfig = await response.json();
        return state.currentConfig;
      }

      async function saveServiceConfig(service, patch) {
        const base = await ensureServiceConfig(service);
        const payload = { ...base, ...patch };
        const response = await fetch(buildServiceUrl(service, service.config_path || '/config'), {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error('failed to save');
        }
        state.currentConfig = await response.json();
        return state.currentConfig;
      }

      async function renderAssistantOrchestratorTools(service) {
        const content = document.getElementById('service-content');
        content.innerHTML = '<div class="status-line">Loading tools...</div>';
        let config;
        try {
          config = await ensureServiceConfig(service);
        } catch {
          content.innerHTML = '<div class="status-line">Failed to load tools</div>';
          return;
        }

        const enabledSet = new Set(Array.isArray(config.enabled_tools) ? config.enabled_tools : []);
        content.innerHTML =
          '<form id="worker-tools-form" class="card border-0 shadow-sm">' +
            '<div class="card-body">' +
              '<h5 class="card-title mb-2">Enabled Tools</h5>' +
              '<p class="text-secondary mb-3">Select tools enabled for assistant-orchestrator runtime.</p>' +
              '<div class="row g-2">' +
                ASSISTANT_ORCHESTRATOR_TOOL_NAMES.map((toolName) =>
                  '<div class="col-md-6">' +
                    '<div class="form-check">' +
                      '<input class="form-check-input" type="checkbox" data-tool-name="' + escapeHtml(toolName) + '" id="worker-tool-' + escapeHtml(toolName) + '"' + (enabledSet.has(toolName) ? ' checked' : '') + ' />' +
                      '<label class="form-check-label fw-semibold" for="worker-tool-' + escapeHtml(toolName) + '">' + escapeHtml(toolName) + '</label>' +
                    '</div>' +
                  '</div>',
                ).join('') +
              '</div>' +
              '<div class="mt-3 d-flex gap-2 align-items-center">' +
                '<button type="submit" class="btn btn-dark">Save tools</button>' +
                '<div id="worker-tools-status" class="text-secondary"></div>' +
              '</div>' +
            '</div>' +
          '</form>';

        document.getElementById('worker-tools-form').addEventListener('submit', async (event) => {
          event.preventDefault();
          const status = document.getElementById('worker-tools-status');
          status.textContent = 'Saving...';
          const selected = Array.from(content.querySelectorAll('input[data-tool-name]:checked'))
            .map((field) => field.getAttribute('data-tool-name'))
            .filter((entry) => typeof entry === 'string');

          try {
            await saveServiceConfig(service, { enabled_tools: selected });
            status.textContent = 'Saved';
          } catch {
            status.textContent = 'Failed to save';
          }
        });
      }

      async function renderAssistantOrchestratorSkills(service) {
        const content = document.getElementById('service-content');
        content.innerHTML = '<div class="status-line">Loading skills...</div>';

        try {
          const response = await fetch(buildServiceUrl(service, '/skills'));
          if (!response.ok) {
            content.innerHTML = '<div class="status-line">Failed to load skills</div>';
            return;
          }
          const payload = await response.json();
          const skills = Array.isArray(payload.skills) ? payload.skills : [];
          if (skills.length === 0) {
            content.innerHTML = '<div class="item">No local skills found in runtime/assistant-orchestrator/skills.</div>';
            return;
          }

          content.innerHTML = '<div class="list">' +
            skills.map((skill) => '<div class="item"><strong>' + escapeHtml(skill) + '</strong></div>').join('') +
          '</div>';
        } catch {
          content.innerHTML = '<div class="status-line">Failed to load skills</div>';
        }
      }

      async function renderGatewayEmailSettings(service) {
        const content = document.getElementById('service-content');
        content.innerHTML = '<div class="status-line">Loading gateway-email settings...</div>';
        let config;
        try {
          config = await ensureServiceConfig(service);
        } catch {
          content.innerHTML = '<div class="status-line">Failed to load gateway-email settings</div>';
          return;
        }

        content.innerHTML =
          '<form id="gateway-email-settings-form">' +
            '<div class="list">' +
              '<div class="item">' +
                '<strong>Email</strong>' +
                '<div class="row" style="margin-top:8px">' +
                  '<label>Email<input id="ge-email" value="' + escapeHtml(config.email || '') + '" /></label>' +
                  '<label>Password<input id="ge-password" type="password" value="' + escapeHtml(config.password || '') + '" /></label>' +
                '</div>' +
              '</div>' +
              '<div class="item">' +
                '<strong>IMAP</strong>' +
                '<div class="row" style="margin-top:8px">' +
                  '<label>Host<input id="ge-imap-host" value="' + escapeHtml(config.imap_host || '') + '" /></label>' +
                  '<label>Port<input id="ge-imap-port" type="number" value="' + escapeHtml(String(config.imap_port ?? '')) + '" /></label>' +
                '</div>' +
                '<div class="row" style="margin-top:8px">' +
                  '<label>Secure (true/false)<input id="ge-imap-secure" value="' + escapeHtml(String(config.imap_secure ?? false)) + '" /></label>' +
                  '<label>Sync delay (sec)<input id="ge-sync-delay" type="number" value="' + escapeHtml(String(config.sync_delay_seconds ?? '')) + '" /></label>' +
                '</div>' +
              '</div>' +
              '<div class="item">' +
                '<strong>SMTP</strong>' +
                '<div class="row" style="margin-top:8px">' +
                  '<label>Host<input id="ge-smtp-host" value="' + escapeHtml(config.smtp_host || '') + '" /></label>' +
                  '<label>Port<input id="ge-smtp-port" type="number" value="' + escapeHtml(String(config.smtp_port ?? '')) + '" /></label>' +
                '</div>' +
                '<div class="row" style="margin-top:8px">' +
                  '<label>Secure (true/false)<input id="ge-smtp-secure" value="' + escapeHtml(String(config.smtp_secure ?? false)) + '" /></label>' +
                  '<div></div>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="actions"><button type="submit">Save gateway-email settings</button></div>' +
            '<div id="gateway-email-settings-status" class="status-line"></div>' +
          '</form>';

        document.getElementById('gateway-email-settings-form').addEventListener('submit', async (event) => {
          event.preventDefault();
          const status = document.getElementById('gateway-email-settings-status');
          status.textContent = 'Saving...';
          const patch = {
            email: document.getElementById('ge-email').value.trim(),
            password: document.getElementById('ge-password').value,
            imap_host: document.getElementById('ge-imap-host').value.trim(),
            imap_port: Number.parseInt(document.getElementById('ge-imap-port').value, 10),
            imap_secure: document.getElementById('ge-imap-secure').value.trim().toLowerCase() === 'true',
            smtp_host: document.getElementById('ge-smtp-host').value.trim(),
            smtp_port: Number.parseInt(document.getElementById('ge-smtp-port').value, 10),
            smtp_secure: document.getElementById('ge-smtp-secure').value.trim().toLowerCase() === 'true',
            sync_delay_seconds: Number.parseInt(document.getElementById('ge-sync-delay').value, 10),
          };
          try {
            await saveServiceConfig(service, patch);
            status.textContent = 'Saved';
          } catch {
            status.textContent = 'Failed to save';
          }
        });
      }

      function renderAssistantLlmTabs(active) {
        return '<div class="subtabs">' +
          ['ollama', 'deepseek', 'xai'].map((provider) => {
            const activeClass = provider === active ? 'active' : '';
            const title = provider === 'deepseek' ? 'DeepSeek' : provider === 'xai' ? 'XAI' : 'Ollama';
            return '<a role="tab" href="#" class="' + activeClass + '" data-llm-tab="' + provider + '">' + title + '</a>';
          }).join('') +
        '</div>';
      }

      async function renderAssistantLlmGeneral(service) {
        const content = document.getElementById('service-content');
        content.innerHTML = '<div class="status-line">Loading assistant-llm status...</div>';
        let providerStatus = null;
        let models = null;
        try {
          const statusResponse = await fetch(buildServiceUrl(service, '/provider-status'));
          if (statusResponse.ok) {
            providerStatus = await statusResponse.json();
          }
          const modelsResponse = await fetch(buildServiceUrl(service, '/models'));
          if (modelsResponse.ok) {
            const payload = await modelsResponse.json();
            if (payload && typeof payload === 'object') {
              models = payload.models;
            }
          }
        } catch {}

        content.innerHTML =
          '<div class="list">' +
            '<div class="item"><strong>Prefix:</strong> <code>' + escapeHtml(service.prefix || '-') + '</code></div>' +
            '<div class="item"><strong>Status endpoint:</strong> <code>' + escapeHtml(service.status_url || 'not exposed') + '</code></div>' +
            '<div class="item"><strong>Menu:</strong> General, Provider, LLMs (Ollama/DeepSeek/XAI)</div>' +
            '<div class="item"><strong>Provider status:</strong> ' + escapeHtml(providerStatus?.status || 'unknown') + '</div>' +
            '<div class="item"><strong>Reachable:</strong> ' + escapeHtml(String(providerStatus?.reachable ?? false)) + '</div>' +
            '<div class="item"><strong>Current provider/model:</strong> ' + escapeHtml((providerStatus?.provider || '-') + ' / ' + (providerStatus?.model || '-')) + '</div>' +
            '<div class="actions"><a href="' + escapeHtml(service.prefix || '/') + '">Open service panel via dashboard prefix</a></div>' +
          '</div>' +
          '<div class="list" style="margin-top:10px">' +
            '<div class="item"><strong>Available models:</strong></div>' +
            '<pre>' + escapeHtml(JSON.stringify(models || {}, null, 2)) + '</pre>' +
          '</div>';
      }

      async function renderAssistantLlmProvider(service) {
        const content = document.getElementById('service-content');
        content.innerHTML = '<div class="status-line">Loading provider settings...</div>';
        let config;
        let modelsByProvider = null;
        try {
          config = await ensureServiceConfig(service);
        } catch {
          content.innerHTML = '<div class="status-line">Failed to load provider settings</div>';
          return;
        }

        try {
          const modelsResponse = await fetch(buildServiceUrl(service, '/models'));
          if (modelsResponse.ok) {
            const modelsPayload = await modelsResponse.json();
            if (modelsPayload && typeof modelsPayload === 'object' && modelsPayload.models) {
              modelsByProvider = modelsPayload.models;
            }
          }
        } catch {}

        const providerOptions = ['deepseek', 'xai', 'ollama'];
        const selectedProvider = providerOptions.includes(config.provider) ? config.provider : 'ollama';
        const initialModels = modelsByProvider && Array.isArray(modelsByProvider[selectedProvider])
          ? modelsByProvider[selectedProvider]
          : [config.model].filter((entry) => typeof entry === 'string' && entry.length > 0);

        content.innerHTML =
          '<form id="assistant-llm-provider-form">' +
            '<div class="row">' +
              '<label>Provider<select id="assistant-llm-provider">' +
                providerOptions.map((provider) =>
                  '<option value="' + escapeHtml(provider) + '"' +
                  (provider === selectedProvider ? ' selected' : '') + '>' +
                  escapeHtml(provider) +
                  '</option>',
                ).join('') +
              '</select></label>' +
              '<label>Model<select id="assistant-llm-model">' +
                initialModels.map((model) =>
                  '<option value="' + escapeHtml(model) + '"' +
                  (model === config.model ? ' selected' : '') + '>' +
                  escapeHtml(model) +
                  '</option>',
                ).join('') +
              '</select></label>' +
            '</div>' +
            '<div class="actions"><button type="submit">Save Provider</button></div>' +
            '<div id="assistant-llm-provider-status" class="status-line"></div>' +
          '</form>';

        const providerSelect = document.getElementById('assistant-llm-provider');
        const modelSelect = document.getElementById('assistant-llm-model');
        const renderProviderModels = (provider, selectedModel) => {
          const models = modelsByProvider && Array.isArray(modelsByProvider[provider])
            ? modelsByProvider[provider]
            : [];
          const source = models.length > 0
            ? models
            : [selectedModel].filter((entry) => typeof entry === 'string' && entry.length > 0);
          modelSelect.innerHTML = source.map((model) =>
            '<option value="' + escapeHtml(model) + '"' +
            (model === selectedModel ? ' selected' : '') + '>' +
            escapeHtml(model) +
            '</option>',
          ).join('');
        };
        providerSelect.addEventListener('change', () => {
          const nextProvider = providerSelect.value;
          renderProviderModels(nextProvider, modelSelect.value || config.model || '');
        });

        document.getElementById('assistant-llm-provider-form').addEventListener('submit', async (event) => {
          event.preventDefault();
          const status = document.getElementById('assistant-llm-provider-status');
          status.textContent = 'Saving...';
          const patch = {
            provider: document.getElementById('assistant-llm-provider').value.trim(),
            model: document.getElementById('assistant-llm-model').value.trim(),
          };
          try {
            await saveServiceConfig(service, patch);
            status.textContent = 'Saved';
          } catch {
            status.textContent = 'Failed to save';
          }
        });
      }

      async function renderAssistantLlmConnections(service) {
        const content = document.getElementById('service-content');
        content.innerHTML = '<div class="status-line">Loading LLM connection settings...</div>';
        let config;
        try {
          config = await ensureServiceConfig(service);
        } catch {
          content.innerHTML = '<div class="status-line">Failed to load LLM settings</div>';
          return;
        }

        const provider = state.assistantLlmTab;
        const fieldsByProvider = {
          ollama: {
            title: 'Ollama',
            base_url_key: 'ollama_base_url',
            timeout_key: 'ollama_timeout_ms',
            api_key_key: null,
          },
          deepseek: {
            title: 'DeepSeek',
            base_url_key: 'deepseek_base_url',
            timeout_key: 'deepseek_timeout_ms',
            api_key_key: 'deepseek_api_key',
          },
          xai: {
            title: 'XAI',
            base_url_key: 'xai_base_url',
            timeout_key: 'xai_timeout_ms',
            api_key_key: 'xai_api_key',
          },
        };
        const spec = fieldsByProvider[provider];
        const apiKeyInput = spec.api_key_key
          ? '<label>API key<input id="assistant-llm-api-key" type="password" value="' + escapeHtml(config[spec.api_key_key] || '') + '" /></label>'
          : '';

        content.innerHTML =
          renderAssistantLlmTabs(provider) +
          '<form id="assistant-llm-connections-form">' +
            '<p class="description">' + escapeHtml(spec.title) + ' connection settings.</p>' +
            apiKeyInput +
            '<label>Base URL<input id="assistant-llm-base-url" value="' + escapeHtml(config[spec.base_url_key] || '') + '" /></label>' +
            '<label>Timeout (ms)<input id="assistant-llm-timeout" type="number" value="' + escapeHtml(String(config[spec.timeout_key] ?? '')) + '" /></label>' +
            '<div class="actions"><button type="submit">Save ' + escapeHtml(spec.title) + '</button></div>' +
            '<div id="assistant-llm-connections-status" class="status-line"></div>' +
          '</form>';

        content.querySelectorAll('a[data-llm-tab]').forEach((tabLink) => {
          tabLink.addEventListener('click', (event) => {
            event.preventDefault();
            state.assistantLlmTab = tabLink.dataset.llmTab;
            void renderAssistantLlmConnections(service);
          });
        });

        document.getElementById('assistant-llm-connections-form').addEventListener('submit', async (event) => {
          event.preventDefault();
          const status = document.getElementById('assistant-llm-connections-status');
          status.textContent = 'Saving...';
          const patch = {
            [spec.base_url_key]: document.getElementById('assistant-llm-base-url').value.trim(),
            [spec.timeout_key]: Number.parseInt(document.getElementById('assistant-llm-timeout').value, 10),
          };
          if (spec.api_key_key) {
            patch[spec.api_key_key] = document.getElementById('assistant-llm-api-key').value;
          }
          try {
            await saveServiceConfig(service, patch);
            status.textContent = 'Saved';
          } catch {
            status.textContent = 'Failed to save';
          }
        });
      }

      async function renderGatewayWebSettings(service) {
        const content = document.getElementById('service-content');
        content.innerHTML = '<div class="status-line">Loading gateway-web settings...</div>';
        let config;
        try {
          config = await ensureServiceConfig(service);
        } catch {
          content.innerHTML = '<div class="status-line">Failed to load gateway-web settings</div>';
          return;
        }

        const allowedTypes = Array.isArray(config.allowed_incoming_message_types)
          ? config.allowed_incoming_message_types
          : GATEWAY_WEB_INCOMING_MESSAGE_TYPES.map((item) => item.value);
        const groups = [];
        for (const item of GATEWAY_WEB_INCOMING_MESSAGE_TYPES) {
          let group = groups.find((entry) => entry.name === item.group);
          if (!group) {
            group = { name: item.group, items: [] };
            groups.push(group);
          }
          group.items.push(item);
        }
        const incomingTypeControls = groups.map((group) =>
          '<div class="border rounded-3 p-3 mb-3">' +
            '<h6 class="mb-2">' + escapeHtml(group.name) + '</h6>' +
            '<div class="d-grid gap-2">' +
              group.items.map((item) =>
                '<div class="form-check">' +
                  '<input class="form-check-input gw-incoming-type" type="checkbox" id="gw-incoming-' + escapeHtml(item.value) + '" value="' + escapeHtml(item.value) + '"' +
                    (allowedTypes.includes(item.value) ? ' checked' : '') +
                  ' />' +
                  '<label class="form-check-label fw-semibold" for="gw-incoming-' + escapeHtml(item.value) + '">' +
                    escapeHtml(item.value + ' - ' + item.description) +
                  '</label>' +
                '</div>',
              ).join('') +
            '</div>' +
          '</div>',
        ).join('');

        content.innerHTML =
          '<form id="gateway-web-settings-form" class="card border-0 shadow-sm">' +
            '<div class="card-body">' +
              '<h5 class="card-title mb-2">Callbacks</h5>' +
              '<p class="text-secondary mb-3">Choose which callback message types are delivered to web chat.</p>' +
              incomingTypeControls +
              '<div class="mt-3 d-flex gap-2 align-items-center">' +
                '<button type="submit" class="btn btn-dark">Save gateway-web settings</button>' +
                '<div id="gateway-web-settings-status" class="text-secondary"></div>' +
              '</div>' +
            '</div>' +
          '</form>';

        document.getElementById('gateway-web-settings-form').addEventListener('submit', async (event) => {
          event.preventDefault();
          const status = document.getElementById('gateway-web-settings-status');
          status.textContent = 'Saving...';
          const selectedIncomingTypes = Array.from(
            content.querySelectorAll('.gw-incoming-type:checked'),
          ).map((checkbox) => checkbox.value);
          const patch = {
            allowed_incoming_message_types: selectedIncomingTypes,
          };
          try {
            await saveServiceConfig(service, patch);
            status.textContent = 'Saved';
          } catch {
            status.textContent = 'Failed to save';
          }
        });
      }

      async function renderAssistantMemorySection(service, section) {
        const content = document.getElementById('service-content');

        if (section === 'settings') {
          content.innerHTML = '<div class="status-line">Loading memory settings...</div>';
          try {
            const response = await fetch(buildServiceUrl(service, '/config'));
            if (!response.ok) {
              content.innerHTML = '<div class="status-line">Failed to load memory settings</div>';
              return;
            }
            const config = await response.json();
            const enabledExtracts = Array.isArray(config.enabled_extracts)
              ? config.enabled_extracts
              : [];
            content.innerHTML =
              '<form id="assistant-memory-settings-form" class="card border-0 shadow-sm">' +
                '<div class="card-body">' +
                  '<h5 class="card-title mb-2">Conversation Enrichment</h5>' +
                  '<p class="text-secondary mb-3">Select which extract jobs run after each appended conversation message.</p>' +
                  '<div class="row g-2">' +
                    '<div class="col-md-6">' +
                      '<div class="form-check">' +
                        '<input class="form-check-input memory-extract" type="checkbox" id="memory-extract-fact" value="fact"' +
                          (enabledExtracts.includes('fact') ? ' checked' : '') +
                          ' />' +
                        '<label class="form-check-label fw-semibold" for="memory-extract-fact">fact</label>' +
                      '</div>' +
                    '</div>' +
                    '<div class="col-md-6">' +
                      '<div class="form-check">' +
                        '<input class="form-check-input memory-extract" type="checkbox" id="memory-extract-profile" value="profile"' +
                          (enabledExtracts.includes('profile') ? ' checked' : '') +
                          ' />' +
                        '<label class="form-check-label fw-semibold" for="memory-extract-profile">profile</label>' +
                      '</div>' +
                    '</div>' +
                  '</div>' +
                  '<div class="mt-3 d-flex gap-2 align-items-center">' +
                    '<button type="submit" class="btn btn-dark">Save memory settings</button>' +
                    '<div id="assistant-memory-settings-status" class="text-secondary"></div>' +
                  '</div>' +
                '</div>' +
              '</form>';

            document
              .getElementById('assistant-memory-settings-form')
              .addEventListener('submit', async (event) => {
                event.preventDefault();
                const status = document.getElementById('assistant-memory-settings-status');
                status.textContent = 'Saving...';
                const selectedExtracts = Array.from(
                  content.querySelectorAll('.memory-extract:checked'),
                ).map((checkbox) => checkbox.value);
                try {
                  await saveServiceConfig(service, {
                    enabled_extracts: selectedExtracts,
                  });
                  status.textContent = 'Saved';
                } catch {
                  status.textContent = 'Failed to save';
                }
              });
          } catch {
            content.innerHTML = '<div class="status-line">Failed to load memory settings</div>';
          }
          return;
        }

        if (section === 'profile') {
          content.innerHTML = '<div class="status-line">Loading profile...</div>';
          try {
            const response = await fetch(buildServiceUrl(service, '/v1/profile'));
            if (!response.ok) {
              content.innerHTML = '<div class="status-line">Failed to load profile</div>';
              return;
            }
            const payload = await response.json();
            content.innerHTML =
              '<div class="actions" style="margin-bottom:8px">' +
                '<button id="profile-delete-button" type="button">Delete Profile</button>' +
                '<span id="profile-delete-status" class="status-line"></span>' +
              '</div>' +
              '<pre id="profile-detail">' + escapeHtml(JSON.stringify(payload, null, 2)) + '</pre>';

            const deleteButton = content.querySelector('#profile-delete-button');
            const deleteStatus = content.querySelector('#profile-delete-status');
            deleteButton.addEventListener('click', async () => {
              deleteStatus.textContent = 'Deleting...';
              deleteButton.disabled = true;
              try {
                const deleteResponse = await fetch(buildServiceUrl(service, '/v1/profile'), {
                  method: 'DELETE',
                });
                if (!deleteResponse.ok) {
                  deleteStatus.textContent = 'Failed to delete profile';
                  return;
                }
                deleteStatus.textContent = 'Profile deleted';
                await renderAssistantMemorySection(service, 'profile');
              } catch {
                deleteStatus.textContent = 'Failed to delete profile';
              } finally {
                deleteButton.disabled = false;
              }
            });
          } catch {
            content.innerHTML = '<div class="status-line">Failed to load profile</div>';
          }
          return;
        }

        if (section === 'conversations') {
          content.innerHTML = '<div class="status-line">Loading conversations...</div>';
          try {
            const listResponse = await fetch(buildServiceUrl(service, '/v1/conversations'));
            if (!listResponse.ok) {
              content.innerHTML = '<div class="status-line">Failed to load conversations</div>';
              return;
            }

            const payload = await listResponse.json();
            const conversations = Array.isArray(payload.threads)
              ? payload.threads
              : Array.isArray(payload.conversations)
                ? payload.conversations
                : [];

            if (conversations.length === 0) {
              content.innerHTML = '<div class="item">No conversations found.</div>';
              return;
            }

            const firstConversation = conversations[0] || null;
            let firstConversationState = null;
            const firstConversationId =
              firstConversation?.thread_id || firstConversation?.conversationId || '';
            if (typeof firstConversationId === 'string' && firstConversationId.length > 0) {
              const readResponse = await fetch(buildServiceUrl(service, '/v1/conversations/read'), {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  chat: firstConversation?.chat || 'direct',
                  user_id: firstConversation?.user_id || firstConversation?.contact || 'default-user',
                  conversation_id: firstConversationId,
                  direction: firstConversation?.direction || 'web',
                }),
              });
              if (readResponse.ok) {
                firstConversationState = await readResponse.json();
              }
            }

            content.innerHTML =
              '<div class="row">' +
                '<div class="list" id="conversation-list">' +
                  conversations.map((conversation) => {
                    const conversationId = conversation.thread_id || conversation.conversationId || '';
                    const updatedAt = conversation.updated_at || conversation.updatedAt || '';
                    const chat = conversation.chat || 'direct';
                    const userId = conversation.user_id || conversation.contact || 'default-user';
                    const direction = conversation.direction || 'web';
                    return '<button class="item" style="text-align:left;cursor:pointer" data-conversation-id="' + escapeHtml(conversationId) + '" data-chat="' + escapeHtml(chat) + '" data-user-id="' + escapeHtml(userId) + '" data-direction="' + escapeHtml(direction) + '">' +
                      '<strong>' + escapeHtml(conversationId) + '</strong><br />' +
                      '<span class="meta">' + escapeHtml(direction + '/' + chat + '/' + userId) + ' · updated=' + escapeHtml(updatedAt) + '</span>' +
                    '</button>';
                  }).join('') +
                '</div>' +
                '<div><pre id="conversation-detail">' + escapeHtml(JSON.stringify(firstConversationState || conversations[0], null, 2)) + '</pre></div>' +
              '</div>';

            content.querySelectorAll('button[data-conversation-id]').forEach((button) => {
              button.addEventListener('click', async () => {
                const conversationId = button.dataset.conversationId;
                const detail = content.querySelector('#conversation-detail');
                detail.textContent = 'Loading...';

                try {
                  const chat = button.dataset.chat || 'direct';
                  const userId = button.dataset.userId || 'default-user';
                  const direction = button.dataset.direction || 'web';
                  const readResponse = await fetch(buildServiceUrl(service, '/v1/conversations/read'), {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({
                      chat,
                      user_id: userId,
                      conversation_id: conversationId,
                      direction,
                    }),
                  });
                  if (!readResponse.ok) {
                    detail.textContent = 'Failed to load conversation';
                    return;
                  }
                  const conversationState = await readResponse.json();
                  detail.textContent = JSON.stringify(conversationState, null, 2);
                } catch {
                  detail.textContent = 'Failed to load conversation';
                }
              });
            });
          } catch {
            content.innerHTML = '<div class="status-line">Failed to load conversations</div>';
          }

          return;
        }

        const kindToCollection = {
          facts: 'facts',
        };
        const collection = kindToCollection[section];

        if (!collection) {
          content.innerHTML = '<div class="status-line">Unknown memory section</div>';
          return;
        }

        content.innerHTML = '<div class="status-line">Loading ' + escapeHtml(collection) + '...</div>';
        try {
          const response = await fetch(buildServiceUrl(service, '/v1/' + collection + '/search'), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ query: '', limit: 100 }),
          });
          if (!response.ok) {
            content.innerHTML = '<div class="status-line">Failed to load ' + escapeHtml(collection) + '</div>';
            return;
          }
          const payload = await response.json();
          const entries = Array.isArray(payload.entries) ? payload.entries : [];
          if (entries.length === 0) {
            content.innerHTML = '<div class="item">No entries in ' + escapeHtml(collection) + '.</div>';
            return;
          }

          content.innerHTML =
            '<div class="row">' +
              '<div class="list" id="memory-list">' +
                entries.map((entry) =>
                  '<button class="item" style="text-align:left;cursor:pointer" data-memory-id="' + escapeHtml(entry.id) + '" data-memory-kind="' + escapeHtml(collection) + '">' +
                    '<strong>' + escapeHtml(entry.id) + '</strong><br />' +
                    '<span class="meta">' + escapeHtml((entry.content || '').slice(0, 140) || '(empty)') + '</span>' +
                  '</button>',
                ).join('') +
              '</div>' +
              '<div>' +
                '<div class="actions" style="margin-bottom:8px">' +
                  '<button id="memory-delete-button" type="button">Delete Fact</button>' +
                  '<span id="memory-delete-status" class="status-line"></span>' +
                '</div>' +
                '<pre id="memory-detail">' + escapeHtml(JSON.stringify(entries[0], null, 2)) + '</pre>' +
              '</div>' +
            '</div>';

          let selectedMemoryId = entries[0]?.id || null;
          const deleteButton = content.querySelector('#memory-delete-button');
          const deleteStatus = content.querySelector('#memory-delete-status');
          deleteButton.disabled = !selectedMemoryId;
          deleteButton.addEventListener('click', async () => {
            if (!selectedMemoryId) {
              return;
            }
            deleteStatus.textContent = 'Deleting...';
            deleteButton.disabled = true;
            try {
              const deleteResponse = await fetch(
                buildServiceUrl(
                  service,
                  '/v1/facts/' + encodeURIComponent(selectedMemoryId) + '/archive',
                ),
                { method: 'POST' },
              );
              if (!deleteResponse.ok) {
                deleteStatus.textContent = 'Failed to delete fact';
                return;
              }
              deleteStatus.textContent = 'Fact deleted';
              await renderAssistantMemorySection(service, section);
            } catch {
              deleteStatus.textContent = 'Failed to delete fact';
            } finally {
              deleteButton.disabled = false;
            }
          });

          content.querySelectorAll('button[data-memory-id]').forEach((button) => {
            button.addEventListener('click', async () => {
              const memoryId = button.dataset.memoryId;
              const memoryKind = button.dataset.memoryKind;
              const detail = content.querySelector('#memory-detail');
              selectedMemoryId = memoryId || null;
              deleteButton.disabled = !selectedMemoryId;
              detail.textContent = 'Loading...';
              try {
                const byIdResponse = await fetch(buildServiceUrl(service, '/v1/' + memoryKind + '/' + encodeURIComponent(memoryId)));
                if (!byIdResponse.ok) {
                  detail.textContent = 'Failed to load memory entry';
                  return;
                }
                const byIdPayload = await byIdResponse.json();
                detail.textContent = JSON.stringify(byIdPayload, null, 2);
              } catch {
                detail.textContent = 'Failed to load memory entry';
              }
            });
          });
        } catch {
          content.innerHTML = '<div class="status-line">Failed to load ' + escapeHtml(collection) + '</div>';
        }
      }

      async function renderAssistantOrchestratorIntegrations(service) {
        const content = document.getElementById('service-content');
        content.innerHTML = '<div class="status-line">Loading integrations...</div>';
        let config;
        try {
          config = await ensureServiceConfig(service);
        } catch {
          content.innerHTML = '<div class="status-line">Failed to load integrations</div>';
          return;
        }

        content.innerHTML = '<div class="subtabs"><a role="tab" href="#" class="active disabled">Brave</a></div>' +
          '<form id="worker-brave-form">' +
            '<p class="description">Brave Search tool integration settings.</p>' +
            '<label>Brave API key<input id="worker-brave-api-key" type="password" value="' + escapeHtml(config.brave_api_key || '') + '" /></label>' +
            '<label>Brave base URL<input id="worker-brave-base-url" value="' + escapeHtml(config.brave_base_url || '') + '" /></label>' +
            '<label>Brave timeout (ms)<input id="worker-brave-timeout" type="number" value="' + escapeHtml(String(config.brave_timeout_ms ?? '')) + '" /></label>' +
            '<div class="actions"><button type="submit">Save Brave</button></div>' +
            '<div id="worker-brave-status" class="status-line"></div>' +
          '</form>';

        document.getElementById('worker-brave-form').addEventListener('submit', async (event) => {
          event.preventDefault();
          const status = document.getElementById('worker-brave-status');
          status.textContent = 'Saving...';
          const patch = {
            brave_api_key: document.getElementById('worker-brave-api-key').value,
            brave_base_url: document.getElementById('worker-brave-base-url').value.trim(),
            brave_timeout_ms: Number.parseInt(document.getElementById('worker-brave-timeout').value, 10),
          };
          try {
            await saveServiceConfig(service, patch);
            status.textContent = 'Saved';
          } catch {
            status.textContent = 'Failed to save';
          }
        });
      }

      function renderField(key, value) {
        const id = 'field-' + key;
        const secret = isSecretField(key);
        if (Array.isArray(value)) {
          return '<label>' + escapeHtml(key) + '<textarea id="' + escapeHtml(id) + '">' + escapeHtml(value.join(', ')) + '</textarea></label>';
        }
        if (typeof value === 'boolean') {
          return '<label>' + escapeHtml(key) + '<input id="' + escapeHtml(id) + '" value="' + escapeHtml(String(value)) + '" /></label>';
        }
        return '<label>' + escapeHtml(key) + '<input id="' + escapeHtml(id) + '" type="' + (secret ? 'password' : 'text') + '" value="' + escapeHtml(value ?? '') + '" /></label>';
      }

      function isSecretField(key) {
        const normalized = String(key).toLowerCase();
        return (
          normalized.includes('password') ||
          normalized.includes('api_key') ||
          normalized.includes('token') ||
          normalized.includes('secret')
        );
      }

      function readFieldValue(key, template) {
        const field = document.getElementById('field-' + key);
        const value = field.value;
        if (Array.isArray(template)) {
          return value.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
        }
        if (typeof template === 'number') {
          return Number.parseInt(value, 10);
        }
        if (typeof template === 'boolean') {
          return value.trim().toLowerCase() === 'true';
        }
        return value;
      }

      async function renderEntityTab(service, entityId) {
        const content = document.getElementById('service-content');
        content.innerHTML = '<div class="status-line">Loading entity...</div>';
        const entity = Array.isArray(service.entities)
          ? service.entities.find((entry) => entry.id === entityId)
          : null;
        if (!entity || !entity.path) {
          content.innerHTML = '<div class="status-line">Entity is not configured</div>';
          return;
        }
        const response = await fetch(buildServiceUrl(service, entity.path));
        if (!response.ok) {
          content.innerHTML = '<div class="status-line">Failed to load entity</div>';
          return;
        }
        const payload = await response.json();
        content.innerHTML = '<pre>' + escapeHtml(JSON.stringify(payload, null, 2)) + '</pre>';
      }

      async function bootstrap() {
        await loadCatalog();
        const hashApplied = applyHashState();
        if (state.selectedService) {
          if (!hashApplied) {
            state.selectedSection = defaultSectionForService(state.selectedService);
          }
          updateHashFromState();
        }
        if (!hashApplied && state.selectedService) {
          state.selectedSection = defaultSectionForService(state.selectedService);
        }
        renderMenu();
        await renderService();
        window.addEventListener('hashchange', () => {
          if (!applyHashState()) {
            return;
          }
          state.currentConfig = null;
          renderMenu();
          void renderService();
        });
      }

      void bootstrap();
    </script>
  </body>
</html>`;
  }
}
