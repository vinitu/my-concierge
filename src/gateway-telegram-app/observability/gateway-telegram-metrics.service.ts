import { Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

@Injectable()
export class GatewayTelegramMetricsService {
  private readonly registry = new Registry();
  private readonly requestDurationHistogram = new Histogram({
    name: 'http_request_time_ms',
    help: 'HTTP request duration in milliseconds',
    labelNames: ['route', 'service', 'response_code'] as const,
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
    registers: [this.registry],
  });
  private readonly incomingMessagesCounter = new Counter({
    name: 'incoming_messages_total',
    help: 'Total number of inbound Telegram events',
    labelNames: ['service', 'transport'] as const,
    registers: [this.registry],
  });
  private readonly callbackCounter = new Counter({
    name: 'callback_deliveries_total',
    help: 'Total number of callback deliveries accepted by the gateway',
    labelNames: ['delivered', 'service'] as const,
    registers: [this.registry],
  });
  private readonly upstreamRequestsCounter = new Counter({
    name: 'upstream_requests_total',
    help: 'Total number of upstream requests',
    labelNames: ['service', 'status', 'upstream'] as const,
    registers: [this.registry],
  });
  private readonly endpointCounter = new Counter({
    name: 'endpoint_requests_total',
    help: 'Total number of endpoint requests',
    labelNames: ['endpoint', 'service'] as const,
    registers: [this.registry],
  });
  private readonly threadGauge = new Gauge({
    name: 'telegram_threads_total',
    help: 'Current number of locally stored Telegram threads',
    labelNames: ['service'] as const,
    registers: [this.registry],
  });

  recordRequestDuration(route: string, responseCode: number, durationMs: number): void {
    this.requestDurationHistogram.observe(
      { route, response_code: String(responseCode), service: 'gateway-telegram' },
      durationMs,
    );
  }

  recordIncomingMessage(transport: 'manual' | 'webhook'): void {
    this.incomingMessagesCounter.inc({ service: 'gateway-telegram', transport });
  }

  recordCallback(delivered: boolean): void {
    this.callbackCounter.inc({
      delivered: delivered ? 'true' : 'false',
      service: 'gateway-telegram',
    });
  }

  recordUpstreamRequest(upstream: 'assistant-api' | 'telegram', ok: boolean): void {
    this.upstreamRequestsCounter.inc({
      service: 'gateway-telegram',
      status: ok ? 'success' : 'error',
      upstream,
    });
  }

  recordEndpointRequest(endpoint: string): void {
    this.endpointCounter.inc({ endpoint, service: 'gateway-telegram' });
  }

  setThreadCount(value: number): void {
    this.threadGauge.set({ service: 'gateway-telegram' }, value);
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType;
  }
}
