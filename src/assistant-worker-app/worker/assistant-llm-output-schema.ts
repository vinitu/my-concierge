import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { z } from 'zod/v3';

export interface AssistantLlmGenerateResult {
  context: string;
  memory_writes?: Array<Record<string, unknown>>;
  message: string;
  tool_observations?: Array<Record<string, unknown>>;
}

export interface AssistantLlmPlanResult {
  final?: AssistantLlmGenerateResult;
  tool_call?: {
    arguments: Record<string, unknown>;
    name: string;
  } | null;
}

const toolNameSchema = z.enum([
  'conversation_search',
  'memory_search_federated',
  'memory_search_preference',
  'memory_search_fact',
  'memory_search_routine',
  'memory_search_project',
  'memory_search_episode',
  'memory_search_rule',
  'memory_write_preference',
  'memory_write_fact',
  'memory_write_routine',
  'memory_write_project',
  'memory_write_episode',
  'memory_write_rule',
  'skill_execute',
  'time_current',
  'web_search',
]);

const objectArraySchema = z
  .array(z.record(z.string(), z.unknown()))
  .optional()
  .default([]);

const assistantResultInputSchema = z
  .object({
    answer: z.string().optional(),
    content: z.string().optional(),
    context: z.string().optional().default(''),
    memory_writes: objectArraySchema,
    message: z.string().optional(),
    reply: z.string().optional(),
    response: z.string().optional(),
    text: z.string().optional(),
    tool_observations: objectArraySchema,
  })
  .passthrough()
  .superRefine((value, ctx) => {
    const fields = [
      value.message,
      value.response,
      value.reply,
      value.answer,
      value.text,
      value.content,
    ];
    const hasMessage = fields.some((field) => typeof field === 'string' && field.trim().length > 0);

    if (!hasMessage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Structured output must include a non-empty assistant message in one of: message, response, reply, answer, text, content.',
        path: ['message'],
      });
    }
  })
  .transform((value): AssistantLlmGenerateResult => ({
    context: value.context?.trim() ?? '',
    memory_writes: value.memory_writes ?? [],
    message: [
      value.message,
      value.response,
      value.reply,
      value.answer,
      value.text,
      value.content,
    ].find((field) => typeof field === 'string' && field.trim().length > 0)!.trim(),
    tool_observations: value.tool_observations ?? [],
  }));

const toolCallSchema = z.object({
  arguments: z.record(z.string(), z.unknown()),
  name: toolNameSchema,
});

const planWrapperSchema = z
  .object({
    final: assistantResultInputSchema.optional(),
    tool_call: toolCallSchema.nullish(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    const hasFinal = typeof value.final !== 'undefined';
    const hasTool = typeof value.tool_call === 'object' && value.tool_call !== null;

    if (hasFinal === hasTool) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Planning output must contain exactly one of final or tool_call.',
        path: ['final'],
      });
    }
  })
  .transform(
    (value): AssistantLlmPlanResult => ({
      final: value.final,
      tool_call: value.tool_call ?? null,
    }),
  );

const planningStructuredSchema = z.union([
  planWrapperSchema,
  assistantResultInputSchema.transform(
    (final): AssistantLlmPlanResult => ({
      final,
      tool_call: null,
    }),
  ),
]);

export const assistantPlanningOutputParser =
  StructuredOutputParser.fromZodSchema(planningStructuredSchema);

export const assistantSynthesisOutputParser =
  StructuredOutputParser.fromZodSchema(assistantResultInputSchema);
