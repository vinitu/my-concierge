import { Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

@Injectable()
export class AssistantOrchestratorMetricsService {
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
  private readonly runEventCounter = new Counter({
    name: 'run_events_total',
    help: 'Total number of published run events',
    labelNames: ['service', 'event_type', 'status'] as const,
    registers: [this.registry],
  });
  private readonly queueDepthGauge = new Gauge({
    name: 'queue_messages',
    help: 'Current number of queue files visible to assistant-orchestrator',
    labelNames: ['service'] as const,
    registers: [this.registry],
  });
  private readonly endpointRequestCounter = new Counter({
    name: 'endpoint_requests_total',
    help: 'Total number of endpoint requests',
    labelNames: ['endpoint', 'service'] as const,
    registers: [this.registry],
  });
  private readonly runtimePhaseCounter = new Counter({
    name: 'assistant_runtime_phases_total',
    help: 'Total number of assistant runtime phase executions',
    labelNames: ['phase', 'service', 'status'] as const,
    registers: [this.registry],
  });
  private readonly llmMainRequestCounter = new Counter({
    name: 'llm_main_request_total',
    help: 'Total number of main LLM requests',
    labelNames: ['phase', 'service', 'status'] as const,
    registers: [this.registry],
  });
  private readonly runtimeFallbackCounter = new Counter({
    name: 'runtime_fallback_total',
    help: 'Total number of deterministic runtime fallbacks',
    labelNames: ['reason', 'service'] as const,
    registers: [this.registry],
  });
  private readonly llmDurationHistogram = new Histogram({
    name: 'llm_phase_duration_ms',
    help: 'LLM request duration in milliseconds',
    labelNames: ['phase', 'service', 'status'] as const,
    buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000],
    registers: [this.registry],
  });
  private readonly toolInvocationCounter = new Counter({
    name: 'tool_invocations_total',
    help: 'Total number of assistant tool invocations',
    labelNames: ['service', 'status', 'tool_name'] as const,
    registers: [this.registry],
  });
  private readonly contextExpansionCounter = new Counter({
    name: 'conversation_context_expansions_total',
    help: 'Total number of adaptive conversation context expansion attempts',
    labelNames: ['reason', 'service', 'status'] as const,
    registers: [this.registry],
  });

  recordProcessedJob(): void {
    this.processedJobsCounter.inc({ service: 'assistant-orchestrator' });
  }

  recordRequestDuration(
    route: string,
    responseCode: number,
    durationMs: number,
  ): void {
    this.requestDurationHistogram.observe(
      {
        route,
        service: 'assistant-orchestrator',
        response_code: String(responseCode),
      },
      durationMs,
    );
  }

  recordRunEvent(eventType: string, success: boolean): void {
    this.runEventCounter.inc({
      event_type: eventType,
      service: 'assistant-orchestrator',
      status: success ? 'success' : 'error',
    });
  }

  recordRuntimePhase(phase: string, success: boolean): void {
    this.runtimePhaseCounter.inc({
      phase,
      service: 'assistant-orchestrator',
      status: success ? 'success' : 'error',
    });
  }

  recordLlmMainRequest(success: boolean, phase: string): void {
    this.llmMainRequestCounter.inc({
      phase,
      service: 'assistant-orchestrator',
      status: success ? 'success' : 'error',
    });
  }

  recordLlmMainDurationMs(
    durationMs: number,
    phase: string,
    success = true,
  ): void {
    this.llmDurationHistogram.observe(
      {
        phase,
        service: 'assistant-orchestrator',
        status: success ? 'success' : 'error',
      },
      durationMs,
    );
  }

  recordRuntimeFallback(reason: string): void {
    this.runtimeFallbackCounter.inc({
      reason,
      service: 'assistant-orchestrator',
    });
  }

  recordToolInvocation(toolName: string, success: boolean): void {
    this.toolInvocationCounter.inc({
      service: 'assistant-orchestrator',
      status: success ? 'success' : 'error',
      tool_name: toolName,
    });
  }

  recordContextExpansion(reason: string, success: boolean): void {
    this.contextExpansionCounter.inc({
      reason,
      service: 'assistant-orchestrator',
      status: success ? 'success' : 'error',
    });
  }

  setQueueDepth(value: number): void {
    this.queueDepthGauge.set({ service: 'assistant-orchestrator' }, value);
  }

  recordStatusRequest(): void {
    this.endpointRequestCounter.inc({ endpoint: '/status', service: 'assistant-orchestrator' });
  }

  recordMetricsRequest(): void {
    this.endpointRequestCounter.inc({ endpoint: '/metrics', service: 'assistant-orchestrator' });
  }

  async render(): Promise<string> {
    return this.registry.metrics();
  }
}
