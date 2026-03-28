import { ConversationRegistryService, type SocketEmitter } from './session-registry.service';

describe('ConversationRegistryService', () => {
  it('registers, sends, and unregisters conversations', () => {
    const service = new ConversationRegistryService();
    const client: SocketEmitter = { emit: jest.fn() };

    service.register('conversation-1', client);

    expect(service.has('conversation-1')).toBe(true);
    expect(service.sendAssistantMessage('conversation-1', 'hello')).toBe(true);
    expect(client.emit).toHaveBeenCalledWith('assistant.message', { message: 'hello' });

    service.unregister('conversation-1', client);

    expect(service.has('conversation-1')).toBe(false);
    expect(service.sendAssistantMessage('conversation-1', 'hello')).toBe(false);
  });

  it('does not unregister a replaced conversation with an outdated socket reference', () => {
    const service = new ConversationRegistryService();
    const firstClient: SocketEmitter = { emit: jest.fn() };
    const secondClient: SocketEmitter = { emit: jest.fn() };

    service.register('conversation-1', firstClient);
    service.register('conversation-1', secondClient);
    service.unregister('conversation-1', firstClient);

    expect(service.has('conversation-1')).toBe(true);
    expect(service.sendAssistantMessage('conversation-1', 'hello')).toBe(true);
    expect(secondClient.emit).toHaveBeenCalledWith('assistant.message', { message: 'hello' });
  });

  it('sends thinking notifications to a registered conversation', () => {
    const service = new ConversationRegistryService();
    const client: SocketEmitter = { emit: jest.fn() };

    service.register('conversation-1', client);

    expect(service.sendAssistantThinking('conversation-1', 2)).toBe(true);
    expect(client.emit).toHaveBeenCalledWith('assistant.thinking', { seconds: 2 });
  });
});
