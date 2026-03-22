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
    private readonly sessionRegistryService: SessionRegistryService,
    private readonly metricsService: MetricsService,
  ) {}

  handleConnection(client: Socket): void {
    this.sessionRegistryService.register(client.id, client);
    this.metricsService.setActiveSessions(this.sessionRegistryService.count());
  }

  handleDisconnect(client: Socket): void {
    this.sessionRegistryService.unregister(client.id);
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
      await this.assistantApiClientService.sendConversation({
        contact: client.id,
        message,
      });
    } catch {
      client.emit('assistant.error', {
        message: 'assistant-api is unavailable',
      });
    }
  }
}
