import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface DashboardServiceDefinition {
  kind: 'application' | 'infrastructure';
  name: string;
  notes: string;
  panel_url: string | null;
  status_url: string | null;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

@Injectable()
export class DashboardServiceRegistryService {
  constructor(private readonly configService: ConfigService) {}

  list(): DashboardServiceDefinition[] {
    const assistantApiPanel = this.url('DASHBOARD_ASSISTANT_API_PANEL_URL', 'http://localhost:3000');
    const assistantApiStatus = this.url('DASHBOARD_ASSISTANT_API_STATUS_URL', 'http://assistant-api:3000/status');
    const assistantWorkerPanel = this.url('DASHBOARD_ASSISTANT_WORKER_PANEL_URL', 'http://localhost:3001');
    const assistantWorkerStatus = this.url('DASHBOARD_ASSISTANT_WORKER_STATUS_URL', 'http://assistant-worker:3000/status');
    const assistantMemoryPanel = this.url('DASHBOARD_ASSISTANT_MEMORY_PANEL_URL', 'http://localhost:3002');
    const assistantMemoryStatus = this.url('DASHBOARD_ASSISTANT_MEMORY_STATUS_URL', 'http://assistant-memory:3000/status');
    const gatewayWebPanel = this.url('DASHBOARD_GATEWAY_WEB_PANEL_URL', 'http://localhost:8079');
    const gatewayWebStatus = this.url('DASHBOARD_GATEWAY_WEB_STATUS_URL', 'http://gateway-web:3000/status');
    const gatewayTelegramPanel = this.url('DASHBOARD_GATEWAY_TELEGRAM_PANEL_URL', 'http://localhost:8081');
    const gatewayTelegramStatus = this.url('DASHBOARD_GATEWAY_TELEGRAM_STATUS_URL', 'http://gateway-telegram:3000/status');
    const gatewayEmailPanel = this.url('DASHBOARD_GATEWAY_EMAIL_PANEL_URL', 'http://localhost:8082');
    const gatewayEmailStatus = this.url('DASHBOARD_GATEWAY_EMAIL_STATUS_URL', 'http://gateway-email:3000/status');
    const swaggerPanel = this.url('DASHBOARD_SWAGGER_PANEL_URL', 'http://localhost:8088');
    const dashboardPanel = this.url('DASHBOARD_PANEL_URL', 'http://localhost:8080');
    const dashboardStatus = this.url('DASHBOARD_STATUS_URL', 'http://dashboard:3000/status');

    return [
      {
        kind: 'application',
        name: 'assistant-api',
        notes: 'Ingress, queueing, callback ownership',
        panel_url: assistantApiPanel,
        status_url: assistantApiStatus,
      },
      {
        kind: 'application',
        name: 'assistant-worker',
        notes: 'LangChain runtime, conversation state, tools',
        panel_url: assistantWorkerPanel,
        status_url: assistantWorkerStatus,
      },
      {
        kind: 'application',
        name: 'assistant-memory',
        notes: 'Profile, typed memory API, retrieval, writes',
        panel_url: assistantMemoryPanel,
        status_url: assistantMemoryStatus,
      },
      {
        kind: 'application',
        name: 'gateway-web',
        notes: 'Browser chat panel and callbacks',
        panel_url: gatewayWebPanel,
        status_url: gatewayWebStatus,
      },
      {
        kind: 'application',
        name: 'gateway-telegram',
        notes: 'Telegram panel and Bot API bridge',
        panel_url: gatewayTelegramPanel,
        status_url: gatewayTelegramStatus,
      },
      {
        kind: 'application',
        name: 'gateway-email',
        notes: 'Email panel, mailbox runtime, sync loop',
        panel_url: gatewayEmailPanel,
        status_url: gatewayEmailStatus,
      },
      {
        kind: 'application',
        name: 'swagger',
        notes: 'Shared OpenAPI viewer',
        panel_url: swaggerPanel,
        status_url: null,
      },
      {
        kind: 'application',
        name: 'dashboard',
        notes: 'Service overview and status aggregation',
        panel_url: dashboardPanel,
        status_url: dashboardStatus,
      },
      {
        kind: 'infrastructure',
        name: 'redis',
        notes: 'Queue transport, internal only',
        panel_url: null,
        status_url: null,
      },
      {
        kind: 'infrastructure',
        name: 'mysql',
        notes: 'Canonical conversation and memory storage',
        panel_url: null,
        status_url: null,
      },
    ];
  }

  private url(key: string, fallback: string): string {
    return trimTrailingSlash(this.configService.get<string>(key, fallback));
  }
}
