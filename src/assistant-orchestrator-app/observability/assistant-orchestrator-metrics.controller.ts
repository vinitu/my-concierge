import {
  Controller,
  Get,
  Header,
} from '@nestjs/common';
import { AssistantOrchestratorMetricsService } from './assistant-orchestrator-metrics.service';

@Controller()
export class AssistantOrchestratorMetricsController {
  constructor(private readonly metricsService: AssistantOrchestratorMetricsService) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    this.metricsService.recordMetricsRequest();
    return this.metricsService.render();
  }
}

