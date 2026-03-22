import { Injectable } from '@nestjs/common';

export interface SocketEmitter {
  emit(event: string, payload: unknown): void;
}

@Injectable()
export class SessionRegistryService {
  private readonly sessions = new Map<string, SocketEmitter>();

  register(sessionId: string, client: SocketEmitter): void {
    this.sessions.set(sessionId, client);
  }

  unregister(sessionId: string, client?: SocketEmitter): void {
    const currentClient = this.sessions.get(sessionId);

    if (!currentClient) {
      return;
    }

    if (client && currentClient !== client) {
      return;
    }

    this.sessions.delete(sessionId);
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  count(): number {
    return this.sessions.size;
  }

  sendAssistantMessage(sessionId: string, message: string): boolean {
    const client = this.sessions.get(sessionId);

    if (!client) {
      return false;
    }

    client.emit('assistant.message', { message });
    return true;
  }

  sendAssistantThinking(sessionId: string, seconds: number): boolean {
    const client = this.sessions.get(sessionId);

    if (!client) {
      return false;
    }

    client.emit('assistant.thinking', { seconds });
    return true;
  }
}
