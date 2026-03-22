import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { AssistantApiClientService } from '../assistant-api/assistant-api-client.service';
import { MetricsService } from '../observability/metrics.service';
import { GatewayWebRuntimeService } from './gateway-web-runtime.service';
import {
  ensureGatewayWebSessionId,
  GATEWAY_WEB_SESSION_COOKIE,
  normalizeGatewayWebSessionId,
  parseCookieValue,
} from './gateway-web-session';
import { SessionRegistryService } from './session-registry.service';

interface ChatMessagePayload {
  message?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  path: '/ws',
})
export class GatewayWebGateway
  implements OnGatewayConnection<Socket>, OnGatewayDisconnect<Socket>
{
  constructor(
    private readonly assistantApiClientService: AssistantApiClientService,
    private readonly gatewayWebRuntimeService: GatewayWebRuntimeService,
    private readonly sessionRegistryService: SessionRegistryService,
    private readonly metricsService: MetricsService,
  ) {}

  handleConnection(client: Socket): void {
    const sessionId = this.resolveSessionId(client);

    client.data.sessionId = sessionId;
    this.sessionRegistryService.register(sessionId, client);
    client.emit('session.ready', { sessionId });
    this.metricsService.setActiveSessions(this.sessionRegistryService.count());
  }

  handleDisconnect(client: Socket): void {
    const sessionId = this.resolveSessionId(client);

    this.sessionRegistryService.unregister(sessionId, client);
    this.metricsService.setActiveSessions(this.sessionRegistryService.count());
  }

  @SubscribeMessage('chat.message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChatMessagePayload,
  ): Promise<void> {
    const message = payload.message?.trim() ?? '';

    if (!message) {
      client.emit('assistant.error', {
        message: 'Message must not be empty',
      });
      return;
    }

    this.metricsService.recordIncomingWebSocketMessage();

    try {
      const sessionId = this.resolveSessionId(client);

      await this.gatewayWebRuntimeService.appendUserMessage(sessionId, message);
      await this.assistantApiClientService.sendConversation({
        conversationId: sessionId,
        message,
      });
    } catch {
      client.emit('assistant.error', {
        message: 'assistant-api is unavailable',
      });
    }
  }

  private resolveSessionId(client: Socket): string {
    const existing = normalizeGatewayWebSessionId(client.data.sessionId);

    if (existing) {
      return existing;
    }

    const authSessionId = normalizeGatewayWebSessionId(client.handshake.auth?.sessionId);
    const cookieSessionId = normalizeGatewayWebSessionId(
      parseCookieValue(client.handshake.headers.cookie, GATEWAY_WEB_SESSION_COOKIE),
    );

    return ensureGatewayWebSessionId(authSessionId ?? cookieSessionId ?? client.id);
  }
}
