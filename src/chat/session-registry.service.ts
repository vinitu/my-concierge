import { Injectable } from '@nestjs/common';

export interface SocketEmitter {
  emit(event: string, payload: unknown): void;
}

@Injectable()
export class SessionRegistryService {
  private readonly sessions = new Map<string, SocketEmitter>();

  register(contact: string, client: SocketEmitter): void {
    this.sessions.set(contact, client);
  }

  unregister(contact: string): void {
    this.sessions.delete(contact);
  }

  has(contact: string): boolean {
    return this.sessions.has(contact);
  }

  count(): number {
    return this.sessions.size;
  }

  sendAssistantMessage(contact: string, message: string): boolean {
    const client = this.sessions.get(contact);

    if (!client) {
      return false;
    }

    client.emit('assistant.message', { message });
    return true;
  }
}

