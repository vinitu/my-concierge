import { Injectable } from '@nestjs/common';

export interface SocketEmitter {
  emit(event: string, payload: unknown): void;
}

@Injectable()
export class ConversationRegistryService {
  private readonly conversations = new Map<string, SocketEmitter>();

  register(conversationId: string, client: SocketEmitter): void {
    this.conversations.set(conversationId, client);
  }

  unregister(conversationId: string, client?: SocketEmitter): void {
    const currentClient = this.conversations.get(conversationId);

    if (!currentClient) {
      return;
    }

    if (client && currentClient !== client) {
      return;
    }

    this.conversations.delete(conversationId);
  }

  has(conversationId: string): boolean {
    return this.conversations.has(conversationId);
  }

  count(): number {
    return this.conversations.size;
  }

  sendAssistantMessage(conversationId: string, message: string): boolean {
    const client = this.conversations.get(conversationId);

    if (!client) {
      return false;
    }

    client.emit('assistant.message', { message });
    return true;
  }

  sendAssistantThinking(conversationId: string, seconds: number): boolean {
    const client = this.conversations.get(conversationId);

    if (!client) {
      return false;
    }

    client.emit('assistant.thinking', { seconds });
    return true;
  }

  sendAssistantError(conversationId: string, message: string): boolean {
    const client = this.conversations.get(conversationId);

    if (!client) {
      return false;
    }

    client.emit('assistant.error', { message });
    return true;
  }

  sendAssistantEvent(
    conversationId: string,
    event: { message?: string; payload?: unknown; type: string },
  ): boolean {
    const client = this.conversations.get(conversationId);

    if (!client) {
      return false;
    }

    client.emit('assistant.event', event);
    return true;
  }
}

// Backward-compatible alias for existing imports during migration.
export { ConversationRegistryService as SessionRegistryService };
