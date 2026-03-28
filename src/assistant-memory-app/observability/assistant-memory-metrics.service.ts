import { Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';
import type { MemoryKind } from '../../contracts/assistant-memory';

@Injectable()
export class AssistantMemoryMetricsService {
  private readonly registry = new Registry();
  private readonly requestDurationHistogram = new Histogram({
    name: 'memory_request_duration_ms',
    help: 'assistant-memory HTTP request duration in milliseconds',
    labelNames: ['endpoint', 'response_code'] as const,
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
    registers: [this.registry],
  });
  private readonly endpointRequestCounter = new Counter({
    name: 'endpoint_requests_total',
    help: 'Total number of endpoint requests',
    labelNames: ['endpoint', 'service'] as const,
    registers: [this.registry],
  });
  private readonly searchCounter = new Counter({
    name: 'memory_search_total',
    help: 'Total number of memory search requests',
    labelNames: ['kind', 'status'] as const,
    registers: [this.registry],
  });
  private readonly writeCounter = new Counter({
    name: 'memory_write_total',
    help: 'Total number of memory write requests',
    labelNames: ['kind', 'status'] as const,
    registers: [this.registry],
  });
  private readonly archiveCounter = new Counter({
    name: 'memory_archive_total',
    help: 'Total number of memory archive requests',
    labelNames: ['kind', 'status'] as const,
    registers: [this.registry],
  });
  private readonly compactCounter = new Counter({
    name: 'memory_compact_total',
    help: 'Total number of compact operations',
    labelNames: ['status'] as const,
    registers: [this.registry],
  });
  private readonly reindexCounter = new Counter({
    name: 'memory_reindex_total',
    help: 'Total number of reindex operations',
    labelNames: ['status'] as const,
    registers: [this.registry],
  });
  private readonly validationFailureCounter = new Counter({
    name: 'memory_validation_failures_total',
    help: 'Total number of rejected memory write candidates',
    labelNames: ['kind', 'reason'] as const,
    registers: [this.registry],
  });
  private readonly entryGauge = new Gauge({
    name: 'memory_entries_total',
    help: 'Current number of active memory entries',
    labelNames: ['kind'] as const,
    registers: [this.registry],
  });

  recordRequestDuration(endpoint: string, responseCode: number, durationMs: number): void {
    this.requestDurationHistogram.observe(
      {
        endpoint,
        response_code: String(responseCode),
      },
      durationMs,
    );
  }

  recordMetricsRequest(): void {
    this.endpointRequestCounter.inc({
      endpoint: '/metrics',
      service: 'assistant-memory',
    });
  }

  recordStatusRequest(): void {
    this.endpointRequestCounter.inc({
      endpoint: '/status',
      service: 'assistant-memory',
    });
  }

  recordProfileUpdate(success: boolean): void {
    this.writeCounter.inc({
      kind: 'profile',
      status: success ? 'success' : 'error',
    });
  }

  recordSearch(kind: MemoryKind | 'federated', success: boolean): void {
    this.searchCounter.inc({
      kind,
      status: success ? 'success' : 'error',
    });
  }

  recordWrite(kind: MemoryKind | 'profile', success: boolean): void {
    this.writeCounter.inc({
      kind,
      status: success ? 'success' : 'error',
    });
  }

  recordArchive(kind: MemoryKind, success: boolean): void {
    this.archiveCounter.inc({
      kind,
      status: success ? 'success' : 'error',
    });
  }

  recordCompact(success: boolean): void {
    this.compactCounter.inc({
      status: success ? 'success' : 'error',
    });
  }

  recordReindex(success: boolean): void {
    this.reindexCounter.inc({
      status: success ? 'success' : 'error',
    });
  }

  recordValidationFailure(kind: MemoryKind, reason: string): void {
    this.validationFailureCounter.inc({ kind, reason });
  }

  setEntryCount(kind: MemoryKind, total: number): void {
    this.entryGauge.set({ kind }, total);
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }
}
