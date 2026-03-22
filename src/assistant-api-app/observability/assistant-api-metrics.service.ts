import { Inject, Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Registry,
} from 'prom-client';
import {
  QUEUE_ADAPTER,
  type QueueAdapter,
} from '../queue/queue-adapter';

@Injectable()
export class AssistantApiMetricsService {
  private readonly registry = new Registry();
  private readonly acceptedConversationCounter = new Counter({
    name: 'assistant_api_conversations_accepted_total',
    help: 'Total number of accepted conversation requests',
    registers: [this.registry],
  });
  private readonly queueDepthGauge = new Gauge({
    name: 'assistant_api_queue_messages',
    help: 'Current number of messages in the queue',
    registers: [this.registry],
  });
  private readonly statusRequestCounter = new Counter({
    name: 'assistant_api_status_requests_total',
    help: 'Total number of status endpoint requests',
    registers: [this.registry],
  });
  private readonly metricsRequestCounter = new Counter({
    name: 'assistant_api_metrics_requests_total',
    help: 'Total number of metrics endpoint requests',
    registers: [this.registry],
  });

  constructor(@Inject(QUEUE_ADAPTER) private readonly queueAdapter: QueueAdapter) {}

  recordAcceptedConversation(): void {
    this.acceptedConversationCounter.inc();
  }

  recordStatusRequest(): void {
    this.statusRequestCounter.inc();
  }

  recordMetricsRequest(): void {
    this.metricsRequestCounter.inc();
  }

  async refreshQueueDepth(): Promise<void> {
    this.queueDepthGauge.set(await this.queueAdapter.depth());
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }
}

