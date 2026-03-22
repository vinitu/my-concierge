import { SessionRegistryService, type SocketEmitter } from './session-registry.service';

describe('SessionRegistryService', () => {
  it('registers, sends, and unregisters sessions', () => {
    const service = new SessionRegistryService();
    const client: SocketEmitter = { emit: jest.fn() };

    service.register('session-1', client);

    expect(service.has('session-1')).toBe(true);
    expect(service.sendAssistantMessage('session-1', 'hello')).toBe(true);
    expect(client.emit).toHaveBeenCalledWith('assistant.message', { message: 'hello' });

    service.unregister('session-1', client);

    expect(service.has('session-1')).toBe(false);
    expect(service.sendAssistantMessage('session-1', 'hello')).toBe(false);
  });

  it('does not unregister a replaced session with an outdated socket reference', () => {
    const service = new SessionRegistryService();
    const firstClient: SocketEmitter = { emit: jest.fn() };
    const secondClient: SocketEmitter = { emit: jest.fn() };

    service.register('session-1', firstClient);
    service.register('session-1', secondClient);
    service.unregister('session-1', firstClient);

    expect(service.has('session-1')).toBe(true);
    expect(service.sendAssistantMessage('session-1', 'hello')).toBe(true);
    expect(secondClient.emit).toHaveBeenCalledWith('assistant.message', { message: 'hello' });
  });
});
