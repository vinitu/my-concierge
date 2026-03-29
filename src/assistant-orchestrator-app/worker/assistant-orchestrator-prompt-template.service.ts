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
  ): Promise<string> {
    return this.promptService.buildPlanningPrompt(input, runtimeContext, enabledTools);
  }

  async renderSynthesisPrompt(
    input: AssistantLlmGenerateInput,
    runtimeContext: AssistantOrchestratorRuntimeContext,
    observation: AssistantToolObservation,
    enabledTools?: AssistantToolName[],
  ): Promise<string> {
    return this.promptService.buildSynthesisPrompt(
      input,
      runtimeContext,
      observation,
      enabledTools,
    );
  }

  listAvailableTools(enabledTools?: AssistantToolName[]): AssistantLlmAvailableTool[] {
    return this.promptService.listAvailableTools(enabledTools);
  }
}
