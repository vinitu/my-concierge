import { Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Registry,
} from 'prom-client';

@Injectable()
export class AssistantWorkerMetricsService {
  private readonly registry = new Registry();
  private readonly processedJobsCounter = new Counter({
    name: 'assistant_worker_jobs_processed_total',
    help: 'Total number of processed queue jobs',
    registers: [this.registry],
  });
  private readonly callbackCounter = new Counter({
    name: 'assistant_worker_callback_requests_total',
    help: 'Total number of callback requests',
    labelNames: ['status'] as const,
    registers: [this.registry],
  });
  private readonly queueDepthGauge = new Gauge({
    name: 'assistant_worker_queue_messages',
    help: 'Current number of queue files visible to assistant-worker',
    registers: [this.registry],
  });
  private readonly statusRequestCounter = new Counter({
    name: 'assistant_worker_status_requests_total',
    help: 'Total number of status endpoint requests',
    registers: [this.registry],
  });
  private readonly metricsRequestCounter = new Counter({
    name: 'assistant_worker_metrics_requests_total',
    help: 'Total number of metrics endpoint requests',
    registers: [this.registry],
  });

  recordProcessedJob(): void {
    this.processedJobsCounter.inc();
  }

  recordCallback(success: boolean): void {
    this.callbackCounter.inc({ status: success ? 'success' : 'error' });
  }

  setQueueDepth(value: number): void {
    this.queueDepthGauge.set(value);
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
}

