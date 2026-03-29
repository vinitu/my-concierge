import { z } from 'zod/v3';

export interface AssistantLlmGenerateResult {
  context: string;
  fallback_reason?: string;
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
  'memory_conversation_search',
  'memory_search',
  'memory_preference_search',
  'memory_fact_search',
  'memory_routine_search',
  'memory_project_search',
  'memory_episode_search',
  'memory_rule_search',
  'memory_preference_write',
  'memory_fact_write',
  'memory_routine_write',
  'memory_project_write',
  'memory_episode_write',
  'memory_rule_write',
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
    fallback_reason: z.string().optional(),
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
    fallback_reason: value.fallback_reason?.trim() || undefined,
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

const planningUnifiedSchema = z
  .object({
    context: z.string().optional().default(''),
    fallback_reason: z.string().optional(),
    memory_writes: objectArraySchema,
    message: z.string().optional(),
    tool_arguments: z.record(z.string(), z.unknown()).optional().default({}),
    tool_name: toolNameSchema.optional(),
    tool_observations: objectArraySchema,
    type: z.enum(['final', 'tool_call', 'error']),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (value.type === 'tool_call') {
      if (!value.tool_name) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'tool_name is required when type=tool_call.',
          path: ['tool_name'],
        });
      }
      return;
    }

    if (typeof value.message !== 'string' || value.message.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'message is required when type=final|error.',
        path: ['message'],
      });
    }
  })
  .transform((value): AssistantLlmPlanResult => {
    if (value.type === 'tool_call') {
      return {
        final: undefined,
        tool_call: {
          arguments: value.tool_arguments ?? {},
          name: value.tool_name!,
        },
      };
    }

    return {
      final: {
        context: value.context?.trim() ?? '',
        fallback_reason: value.fallback_reason?.trim() || undefined,
        memory_writes: value.memory_writes ?? [],
        message: value.message!.trim(),
        tool_observations: value.tool_observations ?? [],
      },
      tool_call: null,
    };
  });

interface OutputParser<T> {
  getFormatInstructions(): string;
  parse(text: string): Promise<T>;
}

function createOutputParser<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  formatInstructions: string,
): OutputParser<T> {
  return {
    getFormatInstructions(): string {
      return formatInstructions;
    },
    async parse(text: string): Promise<T> {
      const candidate = text.trim();

      let value: unknown;
      try {
        value = JSON.parse(candidate);
      } catch (error) {
        const parseMessage = error instanceof Error ? error.message : 'Unknown JSON parse error';
        throw new Error(`Failed to parse JSON text: ${parseMessage}. Text: "${candidate}"`);
      }

      try {
        return await schema.parseAsync(value);
      } catch (error) {
        const validationMessage =
          error instanceof Error ? error.message : JSON.stringify(error);
        throw new Error(`Structured output validation failed: ${validationMessage}. Text: "${candidate}"`);
      }
    },
  };
}

const planningFormatInstructions = [
  'Return JSON only.',
  'Required shape:',
  '{"type":"final|tool_call|error","message":"...","tool_name":"optional","tool_arguments":{},"context":"...","memory_writes":[],"tool_observations":[]}',
  'If type=tool_call, provide tool_name + tool_arguments and message may be empty.',
  'If type=final or type=error, message must be non-empty.',
].join('\n');

const synthesisFormatInstructions = [
  'Return JSON only.',
  'Required shape:',
  '{"message":"...","context":"...","memory_writes":[],"tool_observations":[]}',
].join('\n');

export const assistantPlanningOutputParser = createOutputParser(
  planningUnifiedSchema,
  planningFormatInstructions,
);

export const assistantSynthesisOutputParser = createOutputParser(
  assistantResultInputSchema,
  synthesisFormatInstructions,
);
