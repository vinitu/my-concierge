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

  it('sends error notifications to a registered conversation', () => {
    const service = new ConversationRegistryService();
    const client: SocketEmitter = { emit: jest.fn() };

    service.register('conversation-1', client);

    expect(service.sendAssistantError('conversation-1', 'run failed')).toBe(true);
    expect(client.emit).toHaveBeenCalledWith('assistant.error', { message: 'run failed' });
  });

  it('sends tool notifications through the shared assistant event channel', () => {
    const service = new ConversationRegistryService();
    const client: SocketEmitter = { emit: jest.fn() };

    service.register('conversation-1', client);

    expect(
      service.sendAssistantEvent('conversation-1', {
        message: 'Executed web_search successfully.',
        payload: {
          ok: true,
          payload: { result_count: 3 },
          tool_name: 'web_search',
        },
        request_id: 'req-1',
        sequence: 2,
        type: 'tool.web_search.ok',
      }),
    ).toBe(true);
    expect(client.emit).toHaveBeenCalledWith('assistant.event', {
      message: 'Executed web_search successfully.',
      payload: {
        ok: true,
        payload: { result_count: 3 },
        tool_name: 'web_search',
      },
      request_id: 'req-1',
      sequence: 2,
      type: 'tool.web_search.ok',
    });
  });
});
