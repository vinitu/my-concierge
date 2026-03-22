export interface AssistantLlmGenerateResult {
  context: string;
  message: string;
}

interface AssistantLlmJsonReply {
  context?: unknown;
  message?: unknown;
}

function unwrapJsonBlock(value: string): string {
  const trimmed = value.trim();

  if (!trimmed.startsWith('```')) {
    return trimmed;
  }

  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() ?? trimmed;
}

export function parseAssistantLlmResult(value: string): AssistantLlmGenerateResult {
  const normalized = unwrapJsonBlock(value);

  let parsed: AssistantLlmJsonReply;

  try {
    parsed = JSON.parse(normalized) as AssistantLlmJsonReply;
  } catch {
    throw new Error('LLM response must be valid JSON');
  }

  if (typeof parsed.message !== 'string') {
    throw new Error('LLM response JSON must contain string field "message"');
  }

  if (typeof parsed.context !== 'string') {
    throw new Error('LLM response JSON must contain string field "context"');
  }

  const message = parsed.message.trim();

  if (!message) {
    throw new Error('LLM response JSON field "message" must not be empty');
  }

  return {
    context: parsed.context.trim(),
    message,
  };
}
