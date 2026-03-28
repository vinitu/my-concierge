import { Inject, Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';
import {
  QUEUE_ADAPTER,
  type QueueAdapter,
} from '../queue/queue-adapter';

@Injectable()
export class AssistantApiMetricsService {
  private readonly registry = new Registry();
  private readonly requestDurationHistogram = new Histogram({
    name: 'http_request_time_ms',
    help: 'HTTP request duration in milliseconds',
    labelNames: ['route', 'service', 'response_code'] as const,
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
    registers: [this.registry],
  });
  private readonly acceptedConversationCounter = new Counter({
    name: 'accepted_messages_total',
    help: 'Total number of accepted conversation requests',
    labelNames: ['service'] as const,
    registers: [this.registry],
  });
  private readonly queueDepthGauge = new Gauge({
    name: 'queue_messages',
    help: 'Current number of messages in the queue',
    labelNames: ['service'] as const,
    registers: [this.registry],
  });
  private readonly callbackDeliveryCounter = new Counter({
    name: 'callback_deliveries_total',
    help: 'Total number of callback deliveries',
    labelNames: ['service', 'status'] as const,
    registers: [this.registry],
  });
  private readonly endpointRequestCounter = new Counter({
    name: 'endpoint_requests_total',
    help: 'Total number of endpoint requests',
    labelNames: ['endpoint', 'service'] as const,
    registers: [this.registry],
  });

  constructor(@Inject(QUEUE_ADAPTER) private readonly queueAdapter: QueueAdapter) {}

  recordRequestDuration(
    route: string,
    responseCode: number,
    durationMs: number,
  ): void {
    this.requestDurationHistogram.observe(
      {
        route,
        service: 'assistant-api',
        response_code: String(responseCode),
      },
      durationMs,
    );
  }

  recordAcceptedConversation(): void {
    this.acceptedConversationCounter.inc({ service: 'assistant-api' });
  }

  recordCallbackDelivery(success: boolean): void {
    this.callbackDeliveryCounter.inc({
      service: 'assistant-api',
      status: success ? 'success' : 'error',
    });
  }

  recordStatusRequest(): void {
    this.endpointRequestCounter.inc({ endpoint: '/status', service: 'assistant-api' });
  }

  recordMetricsRequest(): void {
    this.endpointRequestCounter.inc({ endpoint: '/metrics', service: 'assistant-api' });
  }

  async refreshQueueDepth(): Promise<void> {
    this.queueDepthGauge.set({ service: 'assistant-api' }, await this.queueAdapter.depth());
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }
}
