import { SessionRegistryService, type SocketEmitter } from './session-registry.service';

describe('SessionRegistryService', () => {
  it('registers, sends, and unregisters sessions', () => {
    const service = new SessionRegistryService();
    const client: SocketEmitter = { emit: jest.fn() };

    service.register('socket-1', client);

    expect(service.has('socket-1')).toBe(true);
    expect(service.sendAssistantMessage('socket-1', 'hello')).toBe(true);
    expect(client.emit).toHaveBeenCalledWith('assistant.message', { message: 'hello' });

    service.unregister('socket-1');

    expect(service.has('socket-1')).toBe(false);
    expect(service.sendAssistantMessage('socket-1', 'hello')).toBe(false);
  });
});

