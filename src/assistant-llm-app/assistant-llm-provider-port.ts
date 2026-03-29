import type { AssistantLlmMessage } from '../contracts/assistant-llm';

export interface AssistantLlmProviderPort {
  generateFromMessages(messages: AssistantLlmMessage[]): Promise<string>;
  summarizeConversation(
    messages: AssistantLlmMessage[],
    previousContext: string,
  ): Promise<string>;
}
