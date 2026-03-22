import { Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

@Injectable()
export class AssistantWorkerMetricsService {
  private readonly registry = new Registry();
  private readonly requestDurationHistogram = new Histogram({
    name: 'http_request_time_ms',
    help: 'HTTP request duration in milliseconds',
    labelNames: ['route', 'service', 'response_code'] as const,
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
    registers: [this.registry],
  });
  private readonly processedJobsCounter = new Counter({
    name: 'processed_jobs_total',
    help: 'Total number of processed queue jobs',
    labelNames: ['service'] as const,
    registers: [this.registry],
  });
  private readonly callbackCounter = new Counter({
    name: 'callback_requests_total',
    help: 'Total number of callback requests',
    labelNames: ['service', 'status'] as const,
    registers: [this.registry],
  });
  private readonly queueDepthGauge = new Gauge({
    name: 'queue_messages',
    help: 'Current number of queue files visible to assistant-worker',
    labelNames: ['service'] as const,
    registers: [this.registry],
  });
  private readonly endpointRequestCounter = new Counter({
    name: 'endpoint_requests_total',
    help: 'Total number of endpoint requests',
    labelNames: ['endpoint', 'service'] as const,
    registers: [this.registry],
  });

  recordProcessedJob(): void {
    this.processedJobsCounter.inc({ service: 'assistant-worker' });
  }

  recordRequestDuration(
    route: string,
    responseCode: number,
    durationMs: number,
  ): void {
    this.requestDurationHistogram.observe(
      {
        route,
        service: 'assistant-worker',
        response_code: String(responseCode),
      },
      durationMs,
    );
  }

  recordCallback(success: boolean): void {
    this.callbackCounter.inc({
      service: 'assistant-worker',
      status: success ? 'success' : 'error',
    });
  }

  setQueueDepth(value: number): void {
    this.queueDepthGauge.set({ service: 'assistant-worker' }, value);
  }

  recordStatusRequest(): void {
    this.endpointRequestCounter.inc({ endpoint: '/status', service: 'assistant-worker' });
  }

  recordMetricsRequest(): void {
    this.endpointRequestCounter.inc({ endpoint: '/metrics', service: 'assistant-worker' });
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }
}
