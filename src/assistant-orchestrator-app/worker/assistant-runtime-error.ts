export type AssistantRuntimeErrorCode =
  | 'MEMORY_ERROR'
  | 'PERSISTENCE_ERROR'
  | 'PROVIDER_ERROR'
  | 'TOOL_ERROR';

export class AssistantRuntimeError extends Error {
  constructor(
    public readonly code: AssistantRuntimeErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
  }
}
