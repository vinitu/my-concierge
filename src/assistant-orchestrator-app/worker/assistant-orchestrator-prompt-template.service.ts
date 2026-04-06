import { Injectable } from '@nestjs/common';
import type { AssistantLlmAvailableTool } from '../../contracts/assistant-llm';
import type { AssistantLlmGenerateInput } from './assistant-llm-provider';
import type { AssistantToolObservation } from './assistant-tool-dispatcher.service';
import type { AssistantToolName } from './assistant-tool-catalog.service';
import { AssistantOrchestratorPromptService } from './assistant-orchestrator-prompt.service';
import type { AssistantOrchestratorRuntimeContext } from './assistant-orchestrator-runtime-context.service';

@Injectable()
export class AssistantOrchestratorPromptTemplateService {
  constructor(private readonly promptService: AssistantOrchestratorPromptService) {}

  async renderPlanningPrompt(
    input: AssistantLlmGenerateInput,
    runtimeContext: AssistantOrchestratorRuntimeContext,
    enabledTools?: AssistantToolName[],
    toolObservations?: AssistantToolObservation[],
  ): Promise<string> {
    return this.promptService.buildPlanningPrompt(
      input,
      runtimeContext,
      enabledTools,
      toolObservations,
    );
  }

  listAvailableTools(enabledTools?: AssistantToolName[]): AssistantLlmAvailableTool[] {
    return this.promptService.listAvailableTools(enabledTools);
  }
}
