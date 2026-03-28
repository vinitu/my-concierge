import {
  Body,
  Controller,
  Get,
  Header,
  Put,
} from '@nestjs/common';
import { GatewayEmailConfigService, type UpdateGatewayEmailConfigBody } from './gateway-email-config.service';
import { GatewayEmailRuntimeService } from './gateway-email-runtime.service';
import { GatewayEmailMetricsService } from './observability/gateway-email-metrics.service';

@Controller()
export class GatewayEmailRootController {
  constructor(
    private readonly gatewayEmailConfigService: GatewayEmailConfigService,
    private readonly gatewayEmailRuntimeService: GatewayEmailRuntimeService,
    private readonly metricsService: GatewayEmailMetricsService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getRoot(): Promise<string> {
    this.metricsService.recordEndpointRequest('/');
    const config = await this.gatewayEmailConfigService.read();
    const threads = (await this.gatewayEmailRuntimeService.listThreads()).slice(0, 20);

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>gateway-email</title>
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
        --surface-2: #f6f8fb;
        --accent: #0f766e;
        --accent-2: #d97706;
        font-family: "Manrope", sans-serif;
      }
      body {
        margin: 0;
        background:
          radial-gradient(circle at top left, rgba(15, 118, 110, 0.08), transparent 28%),
          linear-gradient(180deg, #f4f7fb 0%, #eef2f7 100%);
        color: var(--ink);
      }
      main {
        max-width: 1100px;
        margin: 0 auto;
        padding: 24px 16px 40px;
      }
      .grid {
        display: grid;
        grid-template-columns: 1.2fr 1fr;
        gap: 18px;
      }
      .panel {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 20px;
        box-shadow: 0 10px 30px rgba(23, 32, 51, 0.06);
      }
      h1,h2 { margin: 0 0 12px; }
      p { color: var(--muted); }
      label { display: block; margin-top: 14px; font-weight: 600; }
      input { width: 100%; box-sizing: border-box; padding: 10px 12px; margin-top: 6px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-2); }
      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      button { margin-top: 16px; padding: 12px 16px; border: 0; border-radius: 10px; background: var(--accent); color: white; font-weight: 700; cursor: pointer; }
      button.secondary { background: var(--accent-2); margin-left: 8px; }
      ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
      li { border: 1px solid var(--line); border-radius: 12px; padding: 12px; background: var(--surface-2); }
      .meta { color: var(--muted); font-size: 14px; }
      #status { margin-top: 12px; color: var(--muted); min-height: 24px; }
      @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <div class="grid">
        <section class="panel">
          <h1>gateway-email</h1>
          <p>Configure IMAP and SMTP, keep a local mailbox runtime, and sync threaded email conversations into assistant-api.</p>
          <form id="config-form">
            <div class="row">
              <label>Email<input id="email" name="email" value="${this.escape(config.email)}" /></label>
              <label>Password<input id="password" name="password" type="password" value="${this.escape(config.password)}" /></label>
            </div>
            <div class="row">
              <label>IMAP host<input id="imap_host" name="imap_host" value="${this.escape(config.imap_host)}" /></label>
              <label>IMAP port<input id="imap_port" name="imap_port" type="number" value="${String(config.imap_port)}" /></label>
            </div>
            <div class="row">
              <label>SMTP host<input id="smtp_host" name="smtp_host" value="${this.escape(config.smtp_host)}" /></label>
              <label>SMTP port<input id="smtp_port" name="smtp_port" type="number" value="${String(config.smtp_port)}" /></label>
            </div>
            <div class="row">
              <label>IMAP secure<input id="imap_secure" name="imap_secure" value="${String(config.imap_secure)}" /></label>
              <label>SMTP secure<input id="smtp_secure" name="smtp_secure" value="${String(config.smtp_secure)}" /></label>
            </div>
            <label>Sync delay seconds<input id="sync_delay_seconds" name="sync_delay_seconds" type="number" value="${String(config.sync_delay_seconds)}" /></label>
            <div>
              <button type="submit">Save config</button>
              <button class="secondary" id="sync-button" type="button">Sync now</button>
            </div>
          </form>
          <div id="status"></div>
        </section>
        <section class="panel">
          <h2>Recent threads</h2>
          <ul>
            ${threads
              .map(
                (thread) => `<li><strong>${this.escape(thread.subject || '(no subject)')}</strong><div class="meta">${this.escape(thread.contact)} · ${this.escape(thread.conversation_id)}</div><div class="meta">${this.escape(thread.last_message_at ?? 'never')}</div></li>`,
              )
              .join('') || '<li>No local email threads yet.</li>'}
          </ul>
        </section>
      </div>
    </main>
    <script>
      const form = document.getElementById('config-form');
      const status = document.getElementById('status');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        status.textContent = 'Saving...';
        const payload = {
          email: document.getElementById('email').value,
          password: document.getElementById('password').value,
          imap_host: document.getElementById('imap_host').value,
          imap_port: document.getElementById('imap_port').value,
          imap_secure: document.getElementById('imap_secure').value === 'true',
          smtp_host: document.getElementById('smtp_host').value,
          smtp_port: document.getElementById('smtp_port').value,
          smtp_secure: document.getElementById('smtp_secure').value === 'true',
          sync_delay_seconds: document.getElementById('sync_delay_seconds').value
        };
        const response = await fetch('/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
        status.textContent = response.ok ? 'Config saved' : 'Failed to save config';
      });
      document.getElementById('sync-button').addEventListener('click', async () => {
        status.textContent = 'Syncing...';
        const response = await fetch('/sync', { method: 'POST' });
        const payload = await response.json();
        status.textContent = response.ok ? 'Sync status: ' + payload.status + ', processed: ' + payload.processed : 'Sync failed';
      });
    </script>
  </body>
</html>`;
  }

  @Get('config')
  async getConfig() {
    this.metricsService.recordEndpointRequest('/config');
    return this.gatewayEmailConfigService.read();
  }

  @Put('config')
  async putConfig(@Body() body: UpdateGatewayEmailConfigBody) {
    this.metricsService.recordEndpointRequest('/config');
    return this.gatewayEmailConfigService.write(body);
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
