import type {
  AssistantLlmAvailableTool,
  AssistantLlmMessage,
} from '../contracts/assistant-llm';

export interface AssistantLlmProviderPort {
  generateFromMessages(
    messages: AssistantLlmMessage[],
    availableTools?: AssistantLlmAvailableTool[],
  ): Promise<string>;
  summarizeConversation(
    messages: AssistantLlmMessage[],
    previousContext: string,
  ): Promise<string>;
}
