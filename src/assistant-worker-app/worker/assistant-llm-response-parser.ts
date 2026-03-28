export interface AssistantLlmGenerateResult {
  context: string;
  memory_writes?: Array<Record<string, unknown>>;
  message: string;
  tool_observations?: Array<Record<string, unknown>>;
}

interface AssistantLlmJsonReply {
  answer?: unknown;
  context?: unknown;
  content?: unknown;
  memory_writes?: unknown;
  message?: unknown;
  response?: unknown;
  reply?: unknown;
  text?: unknown;
  tool_observations?: unknown;
}

export interface AssistantLlmPlanResult {
  final?: AssistantLlmGenerateResult;
  tool_call?: {
    arguments: Record<string, unknown>;
    name: string;
  } | null;
}

function unwrapJsonBlock(value: string): string {
  const trimmed = value.trim();

  if (!trimmed.startsWith('```')) {
    return trimmed;
  }

  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() ?? trimmed;
}

function extractJsonObject(value: string): string {
  const normalized = unwrapJsonBlock(value);

  if (normalized.startsWith('{') && normalized.endsWith('}')) {
    return normalized;
  }

  const firstBrace = normalized.indexOf('{');
  const lastBrace = normalized.lastIndexOf('}');

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return normalized.slice(firstBrace, lastBrace + 1).trim();
  }

  return normalized;
}

function firstString(
  ...values: unknown[]
): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

export function parseAssistantLlmResult(value: string): AssistantLlmGenerateResult {
  const normalized = extractJsonObject(value);

  let parsed: AssistantLlmJsonReply;

  try {
    parsed = JSON.parse(normalized) as AssistantLlmJsonReply;
  } catch {
    throw new Error('LLM response must be valid JSON');
  }

  const message = firstString(
    parsed.message,
    parsed.response,
    parsed.reply,
    parsed.answer,
    parsed.text,
    parsed.content,
  );

  if (!message) {
    throw new Error('LLM response JSON must contain string field "message"');
  }

  const context = typeof parsed.context === 'string' ? parsed.context.trim() : '';

  return {
    context,
    memory_writes: Array.isArray(parsed.memory_writes)
      ? parsed.memory_writes.filter(
          (entry): entry is Record<string, unknown> =>
            typeof entry === 'object' && entry !== null,
        )
      : [],
    message,
    tool_observations: Array.isArray(parsed.tool_observations)
      ? parsed.tool_observations.filter(
          (entry): entry is Record<string, unknown> =>
            typeof entry === 'object' && entry !== null,
        )
      : [],
  };
}

export function parseAssistantLlmPlanResult(value: string): AssistantLlmPlanResult {
  const normalized = extractJsonObject(value);
  const parsed = JSON.parse(normalized) as Record<string, unknown>;
  const toolCall = parsed.tool_call;
  const final = parsed.final;

  if (typeof toolCall !== 'object' && typeof final !== 'object') {
    return {
      final: parseAssistantLlmResult(normalized),
      tool_call: null,
    };
  }

  return {
    final:
      typeof final === 'object' && final !== null
        ? parseAssistantLlmResult(JSON.stringify(final))
        : undefined,
    tool_call:
      typeof toolCall === 'object' &&
      toolCall !== null &&
      typeof (toolCall as Record<string, unknown>).name === 'string' &&
      typeof (toolCall as Record<string, unknown>).arguments === 'object' &&
      (toolCall as Record<string, unknown>).arguments !== null
        ? {
            arguments: (toolCall as Record<string, unknown>).arguments as Record<string, unknown>,
            name: (toolCall as Record<string, unknown>).name as string,
          }
        : null,
  };
}
