import { Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  private readonly requestDurationHistogram = new Histogram({
    name: 'http_request_time_ms',
    help: 'HTTP request duration in milliseconds',
    labelNames: ['route', 'service', 'response_code'] as const,
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
    registers: [this.registry],
  });
  private readonly activeSessionsGauge = new Gauge({
    name: 'websocket_active_sessions',
    help: 'Current number of active WebSocket sessions',
    labelNames: ['service'] as const,
    registers: [this.registry],
  });
  private readonly incomingMessagesCounter = new Counter({
    name: 'incoming_messages_total',
    help: 'Total number of incoming WebSocket messages',
    labelNames: ['service', 'transport'] as const,
    registers: [this.registry],
  });
  private readonly callbackCounter = new Counter({
    name: 'callback_deliveries_total',
    help: 'Total number of callback deliveries',
    labelNames: ['delivered', 'service'] as const,
    registers: [this.registry],
  });
  private readonly assistantApiRequestCounter = new Counter({
    name: 'upstream_requests_total',
    help: 'Total number of upstream HTTP requests',
    labelNames: ['service', 'status', 'upstream'] as const,
    registers: [this.registry],
  });
  private readonly endpointRequestCounter = new Counter({
    name: 'endpoint_requests_total',
    help: 'Total number of endpoint requests',
    labelNames: ['endpoint', 'service'] as const,
    registers: [this.registry],
  });

  setActiveSessions(value: number): void {
    this.activeSessionsGauge.set({ service: 'gateway-web' }, value);
  }

  recordRequestDuration(
    route: string,
    responseCode: number,
    durationMs: number,
  ): void {
    this.requestDurationHistogram.observe(
      {
        route,
        service: 'gateway-web',
        response_code: String(responseCode),
      },
      durationMs,
    );
  }

  recordIncomingWebSocketMessage(): void {
    this.incomingMessagesCounter.inc({ service: 'gateway-web', transport: 'websocket' });
  }

  recordCallback(delivered: boolean): void {
    this.callbackCounter.inc({
      delivered: delivered ? 'true' : 'false',
      service: 'gateway-web',
    });
  }

  recordAssistantApiRequest(ok: boolean): void {
    this.assistantApiRequestCounter.inc({
      service: 'gateway-web',
      status: ok ? 'success' : 'error',
      upstream: 'assistant-api',
    });
  }

  recordStatusRequest(): void {
    this.endpointRequestCounter.inc({ endpoint: '/status', service: 'gateway-web' });
  }

  recordMetricsRequest(): void {
    this.endpointRequestCounter.inc({ endpoint: '/metrics', service: 'gateway-web' });
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType;
  }
}
