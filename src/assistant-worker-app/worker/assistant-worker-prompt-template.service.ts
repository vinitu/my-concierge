import { Injectable } from '@nestjs/common';
import type { AssistantLlmGenerateInput } from './assistant-llm-provider';
import type { AssistantToolObservation } from './assistant-tool-dispatcher.service';
import type { AssistantToolName } from './assistant-tool-catalog.service';
import { AssistantWorkerPromptService } from './assistant-worker-prompt.service';
import type { AssistantWorkerRuntimeContext } from './assistant-worker-runtime-context.service';

@Injectable()
export class AssistantWorkerPromptTemplateService {
  constructor(private readonly promptService: AssistantWorkerPromptService) {}

  async renderPlanningPrompt(
    input: AssistantLlmGenerateInput,
    runtimeContext: AssistantWorkerRuntimeContext,
    enabledTools?: AssistantToolName[],
  ): Promise<string> {
    return this.promptService.buildPlanningPrompt(input, runtimeContext, enabledTools);
  }

  async renderSynthesisPrompt(
    input: AssistantLlmGenerateInput,
    runtimeContext: AssistantWorkerRuntimeContext,
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
}
