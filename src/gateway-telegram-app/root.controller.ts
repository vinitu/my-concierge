import {
  Body,
  Controller,
  Get,
  Header,
  Put,
} from '@nestjs/common';
import {
  GatewayTelegramConfigService,
  type UpdateGatewayTelegramConfigBody,
} from './gateway-telegram-config.service';
import { GatewayTelegramRuntimeService } from './gateway-telegram-runtime.service';
import { GatewayTelegramMetricsService } from './observability/gateway-telegram-metrics.service';

@Controller()
export class GatewayTelegramRootController {
  constructor(
    private readonly gatewayTelegramConfigService: GatewayTelegramConfigService,
    private readonly gatewayTelegramRuntimeService: GatewayTelegramRuntimeService,
    private readonly metricsService: GatewayTelegramMetricsService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getRoot(): Promise<string> {
    this.metricsService.recordEndpointRequest('/');
    const config = await this.gatewayTelegramConfigService.read();
    const threads = (await this.gatewayTelegramRuntimeService.listThreads()).slice(0, 20);

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>gateway-telegram</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #132238;
        --muted: #5f7288;
        --line: #d5dfeb;
        --surface: #ffffff;
        --surface-2: #f4f7fb;
        --accent: #0f5ea8;
        font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      }
      body { margin: 0; background: linear-gradient(180deg, #eef4fb 0%, #f8fbff 100%); color: var(--ink); }
      main { max-width: 1080px; margin: 0 auto; padding: 24px 16px 40px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
      .panel { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 20px; box-shadow: 0 10px 30px rgba(19, 34, 56, 0.06); }
      h1,h2 { margin: 0 0 12px; }
      p { color: var(--muted); }
      label { display: block; margin-top: 14px; font-weight: 600; }
      input { width: 100%; box-sizing: border-box; padding: 10px 12px; margin-top: 6px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-2); }
      button { margin-top: 16px; padding: 12px 16px; border: 0; border-radius: 10px; background: var(--accent); color: white; font-weight: 700; cursor: pointer; }
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
          <h1>gateway-telegram</h1>
          <p>Configure the Telegram Bot token, keep a local chat runtime, and bridge Telegram conversations into assistant-api.</p>
          <form id="config-form">
            <label>Bot token<input id="bot_token" name="bot_token" type="password" value="${this.escape(config.bot_token)}" /></label>
            <button type="submit">Save config</button>
          </form>
          <div id="status"></div>
        </section>
        <section class="panel">
          <h2>Recent chats</h2>
          <ul>
            ${threads
              .map(
                (thread) => `<li><strong>${this.escape(thread.contact)}</strong><div class="meta">${this.escape(thread.chat_id)} · ${this.escape(thread.conversation_id)}</div><div class="meta">${this.escape(thread.last_message_at ?? 'never')}</div></li>`,
              )
              .join('') || '<li>No local Telegram threads yet.</li>'}
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
          bot_token: document.getElementById('bot_token').value
        };
        const response = await fetch('/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
        status.textContent = response.ok ? 'Config saved' : 'Failed to save config';
      });
    </script>
  </body>
</html>`;
  }

  @Get('config')
  async getConfig() {
    this.metricsService.recordEndpointRequest('/config');
    return this.gatewayTelegramConfigService.read();
  }

  @Put('config')
  async putConfig(@Body() body: UpdateGatewayTelegramConfigBody) {
    this.metricsService.recordEndpointRequest('/config');
    return this.gatewayTelegramConfigService.write(body);
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
