import { Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

@Injectable()
export class DashboardMetricsService {
  private readonly registry = new Registry();
  private readonly requestDurationHistogram = new Histogram({
    name: 'http_request_time_ms',
    help: 'HTTP request duration in milliseconds',
    labelNames: ['route', 'service', 'response_code'] as const,
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
    registers: [this.registry],
  });
  private readonly endpointCounter = new Counter({
    name: 'endpoint_requests_total',
    help: 'Total number of endpoint requests',
    labelNames: ['endpoint', 'service'] as const,
    registers: [this.registry],
  });
  private readonly upstreamCounter = new Counter({
    name: 'upstream_requests_total',
    help: 'Total number of upstream status requests',
    labelNames: ['service', 'status', 'upstream'] as const,
    registers: [this.registry],
  });
  private readonly serviceStatusGauge = new Gauge({
    name: 'dashboard_service_ready',
    help: 'Current observed service readiness',
    labelNames: ['dashboard_service', 'service'] as const,
    registers: [this.registry],
  });

  recordRequestDuration(route: string, responseCode: number, durationMs: number): void {
    this.requestDurationHistogram.observe(
      { route, response_code: String(responseCode), service: 'dashboard' },
      durationMs,
    );
  }

  recordEndpointRequest(endpoint: string): void {
    this.endpointCounter.inc({ endpoint, service: 'dashboard' });
  }

  recordUpstreamRequest(upstream: string, ok: boolean): void {
    this.upstreamCounter.inc({
      service: 'dashboard',
      status: ok ? 'success' : 'error',
      upstream,
    });
  }

  setObservedService(name: string, ready: boolean | null): void {
    this.serviceStatusGauge.set(
      { dashboard_service: name, service: 'dashboard' },
      ready === null ? -1 : ready ? 1 : 0,
    );
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType;
  }
}
