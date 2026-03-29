import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface DashboardServiceDefinition {
  kind: "application" | "infrastructure";
  key: string;
  name: string;
  notes: string;
  upstream_url: string | null;
  prefix: string | null;
  panel_url: string | null;
  status_url: string | null;
  config_path: string | null;
  entities: Array<{
    id: string;
    label: string;
    path: string;
  }>;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

@Injectable()
export class DashboardServiceRegistryService {
  constructor(private readonly configService: ConfigService) {}

  list(): DashboardServiceDefinition[] {
    const assistantApiPanel = this.url(
      "DASHBOARD_ASSISTANT_API_PANEL_URL",
      "http://localhost:3000",
    );
    const assistantApiStatus = this.url(
      "DASHBOARD_ASSISTANT_API_STATUS_URL",
      "http://assistant-api:3000/status",
    );
    const assistantOrchestratorPanel = this.url(
      "DASHBOARD_ASSISTANT_ORCHESTRATOR_PANEL_URL",
      "http://localhost:3001",
    );
    const assistantOrchestratorStatus = this.url(
      "DASHBOARD_ASSISTANT_ORCHESTRATOR_STATUS_URL",
      "http://assistant-orchestrator:3000/status",
    );
    const assistantMemoryPanel = this.url(
      "DASHBOARD_ASSISTANT_MEMORY_PANEL_URL",
      "http://localhost:3002",
    );
    const assistantMemoryStatus = this.url(
      "DASHBOARD_ASSISTANT_MEMORY_STATUS_URL",
      "http://assistant-memory:3000/status",
    );
    const assistantLlmPanel = this.url(
      "DASHBOARD_ASSISTANT_LLM_PANEL_URL",
      "http://localhost:3003",
    );
    const assistantLlmStatus = this.url(
      "DASHBOARD_ASSISTANT_LLM_STATUS_URL",
      "http://assistant-llm:3000/status",
    );
    const gatewayTelegramPanel = this.url(
      "DASHBOARD_GATEWAY_TELEGRAM_PANEL_URL",
      "http://localhost:8081",
    );
    const gatewayTelegramStatus = this.url(
      "DASHBOARD_GATEWAY_TELEGRAM_STATUS_URL",
      "http://gateway-telegram:3000/status",
    );
    const gatewayEmailPanel = this.url(
      "DASHBOARD_GATEWAY_EMAIL_PANEL_URL",
      "http://localhost:8082",
    );
    const gatewayEmailStatus = this.url(
      "DASHBOARD_GATEWAY_EMAIL_STATUS_URL",
      "http://gateway-email:3000/status",
    );
    const gatewayWebPanel = this.url(
      "DASHBOARD_GATEWAY_WEB_PANEL_URL",
      "http://localhost:8079",
    );
    const gatewayWebStatus = this.url(
      "DASHBOARD_GATEWAY_WEB_STATUS_URL",
      "http://gateway-web:3000/status",
    );

    return [
      {
        key: "assistant-api",
        kind: "application",
        name: "assistant-api",
        notes: "Ingress, queueing, callback ownership",
        upstream_url: this.url(
          "DASHBOARD_ASSISTANT_API_UPSTREAM_URL",
          "http://assistant-api:3000",
        ),
        prefix: "/assistant-api",
        panel_url: assistantApiPanel,
        status_url: assistantApiStatus,
        config_path: null,
        entities: [],
      },
      {
        key: "assistant-orchestrator",
        kind: "application",
        name: "assistant-orchestrator",
        notes: "Runtime execution, conversation state, tools",
        upstream_url: this.url(
          "DASHBOARD_ASSISTANT_ORCHESTRATOR_UPSTREAM_URL",
          "http://assistant-orchestrator:3000",
        ),
        prefix: "/assistant-orchestrator",
        panel_url: assistantOrchestratorPanel,
        status_url: assistantOrchestratorStatus,
        config_path: "/config",
        entities: [{ id: "skills", label: "Skills", path: "/skills" }],
      },
      {
        key: "assistant-llm",
        kind: "application",
        name: "assistant-llm",
        notes: "Central LLM config and generation API",
        upstream_url: this.url(
          "DASHBOARD_ASSISTANT_LLM_UPSTREAM_URL",
          "http://assistant-llm:3000",
        ),
        prefix: "/assistant-llm",
        panel_url: assistantLlmPanel,
        status_url: assistantLlmStatus,
        config_path: "/config",
        entities: [
          {
            id: "provider-status",
            label: "Provider status",
            path: "/provider-status",
          },
          { id: "models", label: "Models", path: "/models" },
        ],
      },
      {
        key: "assistant-memory",
        kind: "application",
        name: "assistant-memory",
        notes: "Profile, typed memory API, retrieval, writes",
        upstream_url: this.url(
          "DASHBOARD_ASSISTANT_MEMORY_UPSTREAM_URL",
          "http://assistant-memory:3000",
        ),
        prefix: "/assistant-memory",
        panel_url: assistantMemoryPanel,
        status_url: assistantMemoryStatus,
        config_path: "/config",
        entities: [],
      },
      {
        key: "gateway-telegram",
        kind: "application",
        name: "gateway-telegram",
        notes: "Telegram panel and Bot API bridge",
        upstream_url: this.url(
          "DASHBOARD_GATEWAY_TELEGRAM_UPSTREAM_URL",
          "http://gateway-telegram:3000",
        ),
        prefix: "/gateway-telegram",
        panel_url: gatewayTelegramPanel,
        status_url: gatewayTelegramStatus,
        config_path: "/config",
        entities: [{ id: "threads", label: "Threads", path: "/threads" }],
      },
      {
        key: "gateway-email",
        kind: "application",
        name: "gateway-email",
        notes: "Email panel, mailbox runtime, sync loop",
        upstream_url: this.url(
          "DASHBOARD_GATEWAY_EMAIL_UPSTREAM_URL",
          "http://gateway-email:3000",
        ),
        prefix: "/gateway-email",
        panel_url: gatewayEmailPanel,
        status_url: gatewayEmailStatus,
        config_path: "/config",
        entities: [{ id: "threads", label: "Threads", path: "/threads" }],
      },
      {
        key: "gateway-web",
        kind: "application",
        name: "gateway-web",
        notes: "Browser chat panel and WebSocket callbacks",
        upstream_url: this.url(
          "DASHBOARD_GATEWAY_WEB_UPSTREAM_URL",
          "http://gateway-web:3000",
        ),
        prefix: "/gateway-web",
        panel_url: gatewayWebPanel,
        status_url: gatewayWebStatus,
        config_path: "/config",
        entities: [],
      },
      {
        key: "redis",
        kind: "infrastructure",
        name: "redis",
        notes: "Queue transport, internal only",
        upstream_url: null,
        prefix: null,
        panel_url: null,
        status_url: null,
        config_path: null,
        entities: [],
      },
      {
        key: "mysql",
        kind: "infrastructure",
        name: "mysql",
        notes: "Canonical conversation and memory storage",
        upstream_url: null,
        prefix: null,
        panel_url: null,
        status_url: null,
        config_path: null,
        entities: [],
      },
    ];
  }

  listManagedApplications(): DashboardServiceDefinition[] {
    return this.list().filter(
      (service) =>
        service.kind === "application" &&
        service.upstream_url &&
        service.prefix,
    );
  }

  findByKey(key: string): DashboardServiceDefinition | null {
    return this.list().find((service) => service.key === key) ?? null;
  }

  private url(key: string, fallback: string): string {
    return trimTrailingSlash(this.configService.get<string>(key, fallback));
  }
}
