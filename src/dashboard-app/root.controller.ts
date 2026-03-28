import { Controller, Get, Header } from '@nestjs/common';
import { DashboardServiceRegistryService } from './dashboard-service-registry.service';
import { DashboardStatusService } from './dashboard-status.service';
import { DashboardMetricsService } from './observability/dashboard-metrics.service';

@Controller()
export class DashboardRootController {
  constructor(
    private readonly dashboardMetricsService: DashboardMetricsService,
    private readonly dashboardServiceRegistryService: DashboardServiceRegistryService,
    private readonly dashboardStatusService: DashboardStatusService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getRoot(): Promise<string> {
    this.dashboardMetricsService.recordEndpointRequest('/');
    const services = this.dashboardServiceRegistryService.list();
    const statuses = await this.dashboardStatusService.listStatuses();
    const refreshSeconds = this.dashboardStatusService.refreshSeconds();

    for (const status of statuses) {
      this.dashboardMetricsService.recordUpstreamRequest(
        status.name,
        status.ready !== false,
      );
      this.dashboardMetricsService.setObservedService(status.name, status.ready);
    }

    const merged = services.map((service) => {
      const status = statuses.find((candidate) => candidate.name === service.name);
      return {
        ...service,
        ready: status?.ready ?? null,
        response_time_ms: status?.response_time_ms ?? null,
        service_status: status?.service_status ?? 'unknown',
        uptime_seconds: status?.uptime_seconds ?? null,
      };
    });

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>dashboard</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #172033;
        --muted: #64748b;
        --line: #d8e0ea;
        --surface: #ffffff;
        --surface-2: #f5f8fc;
        --ok: #0f766e;
        --warn: #b45309;
        --error: #b91c1c;
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        background:
          radial-gradient(circle at top left, rgba(15, 118, 110, 0.08), transparent 28%),
          linear-gradient(180deg, #f4f7fb 0%, #eef2f7 100%);
        color: var(--ink);
      }
      main { max-width: 1220px; margin: 0 auto; padding: 24px 16px 40px; }
      .hero, .panel {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 18px;
        box-shadow: 0 10px 30px rgba(23, 32, 51, 0.06);
      }
      .hero { padding: 22px; margin-bottom: 18px; }
      .panel { padding: 0; overflow: hidden; }
      .tiles {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 14px;
        margin-top: 18px;
      }
      .tile {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 18px;
        box-shadow: 0 10px 30px rgba(23, 32, 51, 0.06);
        padding: 18px;
      }
      h1,h2 { margin: 0 0 10px; }
      p { color: var(--muted); margin: 0; }
      .actions { margin-top: 14px; display: flex; gap: 10px; flex-wrap: wrap; }
      .actions a {
        display: inline-flex;
        align-items: center;
        padding: 10px 14px;
        border-radius: 999px;
        background: #172033;
        color: white;
        text-decoration: none;
        font-weight: 700;
      }
      .badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 700; }
      .ok { background: rgba(15,118,110,0.12); color: var(--ok); }
      .warn { background: rgba(180,83,9,0.12); color: var(--warn); }
      .error { background: rgba(185,28,28,0.12); color: var(--error); }
      .links { display: flex; gap: 10px; flex-wrap: wrap; }
      .links a { color: #0f5ea8; text-decoration: none; font-weight: 600; }
      .small { color: var(--muted); font-size: 13px; }
      .tile-top { display: flex; justify-content: space-between; gap: 10px; align-items: center; margin-bottom: 12px; }
      .tile h2 { margin: 0; font-size: 18px; }
      .tile p { margin-top: 8px; }
      .kv { margin-top: 12px; display: grid; gap: 6px; }
      .pulse { box-shadow: 0 0 0 0 rgba(15,118,110,0.16); animation: pulse 1.8s ease-out infinite; }
      @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(15,118,110,0.18); }
        70% { box-shadow: 0 0 0 12px rgba(15,118,110,0); }
        100% { box-shadow: 0 0 0 0 rgba(15,118,110,0); }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <h1>dashboard</h1>
        <p>One place for service panels, links, and live status checks across the current MyConcierge runtime.</p>
        <p class="small">Auto refresh every ${String(refreshSeconds)} seconds.</p>
        <div class="actions">
          <a href="/">Refresh</a>
          <a href="/openapi.json">OpenAPI</a>
          <a href="/metrics">Metrics</a>
        </div>
      </section>
      <section class="tiles" id="tiles">
        ${merged
          .map((service) => {
            return this.renderTile(service);
          })
          .join('')}
      </section>
    </main>
    <script>
      const tiles = document.getElementById('tiles');
      const refreshMs = ${String(refreshSeconds * 1000)};

      function escapeHtml(value) {
        return String(value)
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');
      }

      function formatUptime(totalSeconds) {
        if (typeof totalSeconds !== 'number' || !Number.isFinite(totalSeconds)) {
          return 'n/a';
        }
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        const parts = [];
        if (days > 0) parts.push(String(days) + 'd');
        if (hours > 0 || parts.length > 0) parts.push(String(hours) + 'h');
        if (minutes > 0 || parts.length > 0) parts.push(String(minutes) + 'm');
        parts.push(String(seconds) + 's');
        return parts.join(' ');
      }

      function renderTile(service) {
        const badgeClass = service.ready === true ? 'ok' : service.ready === false ? 'error' : 'warn';
        const badgeLabel = service.ready === true ? 'UP' : service.ready === false ? 'DOWN' : 'N/A';
        const responseTime = typeof service.response_time_ms === 'number' ? service.response_time_ms.toFixed(1) + ' ms' : 'n/a';
        const healthLabel = service.status_url ? service.status_url : (service.kind === 'infrastructure' ? 'Direct check' : 'Not exposed');
        const panel = service.panel_url
          ? '<div class="links"><a href="' + escapeHtml(service.panel_url) + '">Open panel</a></div>'
          : '<span class="small">No panel</span>';
        return '<article class="tile pulse">' +
          '<div class="tile-top">' +
            '<div><h2>' + escapeHtml(service.name) + '</h2><div class="small">' + escapeHtml(service.kind) + '</div></div>' +
            '<span class="badge ' + badgeClass + '">' + badgeLabel + '</span>' +
          '</div>' +
          '<p>' + escapeHtml(service.notes) + '</p>' +
          '<div class="kv">' +
            '<div class="small">Status: ' + escapeHtml(service.service_status) + '</div>' +
            '<div class="small">Uptime: ' + escapeHtml(formatUptime(service.uptime_seconds)) + '</div>' +
            '<div class="small">Response time: ' + escapeHtml(responseTime) + '</div>' +
            '<div class="small">Health URL: ' + escapeHtml(healthLabel) + '</div>' +
          '</div>' +
          '<div style="margin-top:12px">' + panel + '</div>' +
        '</article>';
      }

      async function refreshStatuses() {
        try {
          const response = await fetch('/services/status');
          if (!response.ok) {
            return;
          }
          const payload = await response.json();
          tiles.innerHTML = payload.services.map(renderTile).join('');
        } catch {
          return;
        }
      }

      setInterval(refreshStatuses, refreshMs);
    </script>
  </body>
</html>`;
  }

  private renderTile(service: {
    kind: string;
    name: string;
    notes: string;
    panel_url: string | null;
    ready: boolean | null;
    response_time_ms: number | null;
    service_status: string;
    status_url: string | null;
    uptime_seconds: number | null;
  }): string {
    const badgeClass =
      service.ready === true ? 'ok' : service.ready === false ? 'error' : 'warn';
    const badgeLabel =
      service.ready === true ? 'UP' : service.ready === false ? 'DOWN' : 'N/A';
    const uptime =
      typeof service.uptime_seconds === 'number'
        ? this.formatUptime(service.uptime_seconds)
        : 'n/a';
    const responseTime =
      typeof service.response_time_ms === 'number'
        ? `${service.response_time_ms.toFixed(1)} ms`
        : 'n/a';
    const panel = service.panel_url
      ? `<div class="links"><a href="${this.escape(service.panel_url)}">Open panel</a></div>`
      : '<span class="small">No panel</span>';
    const healthLabel = service.status_url
      ? service.status_url
      : service.kind === 'infrastructure'
        ? 'Direct check'
        : 'Not exposed';

    return `<article class="tile">
      <div class="tile-top">
        <div>
          <h2>${this.escape(service.name)}</h2>
          <div class="small">${this.escape(service.kind)}</div>
        </div>
        <span class="badge ${badgeClass}">${badgeLabel}</span>
      </div>
      <p>${this.escape(service.notes)}</p>
      <div class="kv">
        <div class="small">Status: ${this.escape(service.service_status)}</div>
        <div class="small">Uptime: ${this.escape(uptime)}</div>
        <div class="small">Response time: ${this.escape(responseTime)}</div>
        <div class="small">Health URL: ${this.escape(healthLabel)}</div>
      </div>
      <div style="margin-top:12px">${panel}</div>
    </article>`;
  }

  private formatUptime(totalSeconds: number): string {
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const parts = [];

    if (days > 0) {
      parts.push(`${String(days)}d`);
    }

    if (hours > 0 || parts.length > 0) {
      parts.push(`${String(hours)}h`);
    }

    if (minutes > 0 || parts.length > 0) {
      parts.push(`${String(minutes)}m`);
    }

    parts.push(`${String(seconds)}s`);
    return parts.join(' ');
  }

  private escape(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}
