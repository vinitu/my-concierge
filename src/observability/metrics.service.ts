import { Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Registry,
} from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  private readonly activeSessionsGauge = new Gauge({
    name: 'gateway_web_active_websocket_sessions',
    help: 'Current number of active WebSocket sessions',
    registers: [this.registry],
  });
  private readonly incomingMessagesCounter = new Counter({
    name: 'gateway_web_incoming_messages_total',
    help: 'Total number of incoming WebSocket messages',
    registers: [this.registry],
  });
  private readonly callbackCounter = new Counter({
    name: 'gateway_web_callbacks_total',
    help: 'Total number of callback deliveries',
    labelNames: ['delivered'] as const,
    registers: [this.registry],
  });
  private readonly assistantApiRequestCounter = new Counter({
    name: 'gateway_web_assistant_api_requests_total',
    help: 'Total number of requests from gateway-web to assistant-api',
    labelNames: ['status'] as const,
    registers: [this.registry],
  });
  private readonly statusRequestCounter = new Counter({
    name: 'gateway_web_status_requests_total',
    help: 'Total number of status endpoint requests',
    registers: [this.registry],
  });
  private readonly metricsRequestCounter = new Counter({
    name: 'gateway_web_metrics_requests_total',
    help: 'Total number of metrics endpoint requests',
    registers: [this.registry],
  });

  setActiveSessions(value: number): void {
    this.activeSessionsGauge.set(value);
  }

  recordIncomingWebSocketMessage(): void {
    this.incomingMessagesCounter.inc();
  }

  recordCallback(delivered: boolean): void {
    this.callbackCounter.inc({ delivered: delivered ? 'true' : 'false' });
  }

  recordAssistantApiRequest(ok: boolean): void {
    this.assistantApiRequestCounter.inc({ status: ok ? 'success' : 'error' });
  }

  recordStatusRequest(): void {
    this.statusRequestCounter.inc();
  }

  recordMetricsRequest(): void {
    this.metricsRequestCounter.inc();
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType;
  }
}

