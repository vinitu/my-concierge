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
import { GatewayWebConfigService } from './gateway-web-config.service';
import {
  ensureGatewayWebConversationId,
  GATEWAY_WEB_CONVERSATION_COOKIE,
  normalizeGatewayWebConversationId,
  parseCookieValue,
} from './gateway-web-session';
import { ConversationRegistryService } from './session-registry.service';

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
    private readonly gatewayWebConfigService: GatewayWebConfigService,
    private readonly conversationRegistryService: ConversationRegistryService,
    private readonly metricsService: MetricsService,
  ) {}

  handleConnection(client: Socket): void {
    const conversationId = this.resolveConversationId(client);

    client.data.conversationId = conversationId;
    this.conversationRegistryService.register(conversationId, client);
    client.emit('conversation.ready', { conversationId });
    this.metricsService.setActiveSessions(this.conversationRegistryService.count());
  }

  handleDisconnect(client: Socket): void {
    const conversationId = this.resolveConversationId(client);

    this.conversationRegistryService.unregister(conversationId, client);
    this.metricsService.setActiveSessions(this.conversationRegistryService.count());
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
      const conversationId = this.resolveConversationId(client);
      const config = await this.gatewayWebConfigService.read();

      await this.assistantApiClientService.sendConversation({
        conversationId,
        message,
        userId: config.user_id,
      });
    } catch {
      client.emit('assistant.error', {
        message: 'assistant-api is unavailable',
      });
    }
  }

  private resolveConversationId(client: Socket): string {
    const existing = normalizeGatewayWebConversationId(client.data.conversationId);

    if (existing) {
      return existing;
    }

    const authConversationId = normalizeGatewayWebConversationId(
      client.handshake.auth?.conversationId,
    );
    const cookieConversationId = normalizeGatewayWebConversationId(
      parseCookieValue(client.handshake.headers.cookie, GATEWAY_WEB_CONVERSATION_COOKIE),
    );

    return ensureGatewayWebConversationId(
      authConversationId ?? cookieConversationId ?? client.id,
    );
  }
}
