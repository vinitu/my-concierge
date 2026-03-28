import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AssistantLlmGenerateInput } from './assistant-llm-provider';
import type { AssistantToolObservation } from './assistant-tool-dispatcher.service';
import type { AssistantToolName } from './assistant-tool-catalog.service';
import { AssistantWorkerPromptService } from './assistant-worker-prompt.service';
import type { AssistantWorkerRuntimeContext } from './assistant-worker-runtime-context.service';

const DEFAULT_ASSISTANT_SYSTEM_PROMPT_TEMPLATE = [
  'You will receive one JSON object.',
  '',
  'The object has this structure:',
  '- request_format: explains the meaning and format of the request fields',
  '- response_format: explains the required response JSON',
  '- request: the actual current request data that you must process',
  '',
  'You must read the request object and return exactly one JSON object that matches response_format.',
  'Do not wrap JSON in markdown code fences.',
  'Do not output text before or after the response JSON object.',
  '',
  '{{request}}',
].join('\n');

@Injectable()
export class AssistantWorkerPromptTemplateService {
  constructor(
    private readonly configService: ConfigService,
    private readonly promptService: AssistantWorkerPromptService,
  ) {}

  async renderAssistantSystemPrompt(
    input: AssistantLlmGenerateInput,
    runtimeContext: AssistantWorkerRuntimeContext,
  ): Promise<string> {
    const template =
      (await this.readOptionalTemplate('user-prompt.md')) ??
      DEFAULT_ASSISTANT_SYSTEM_PROMPT_TEMPLATE;

    return this.renderTemplate(template, {
      request: this.promptService.buildRequestSection(input, runtimeContext),
    });
  }

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

  private promptsdir(): string {
    return this.configService.get<string>('ASSISTANT_PROMPTS_DIR', join(process.cwd(), 'prompts'));
  }

  private async readOptionalTemplate(filename: string): Promise<string | null> {
    try {
      return await readFile(join(this.promptsdir(), filename), 'utf8');
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return null;
      }

      throw error;
    }
  }

  private renderTemplate(template: string, values: Record<string, string>): string {
    return Object.entries(values)
      .reduce(
        (result, [key, value]) => result.replaceAll(`{{${key}}}`, value.trim()),
        template,
      )
      .trim();
  }
}
