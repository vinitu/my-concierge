import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { GatewayEmailAssistantApiClientService } from './assistant-api-client.service';
import { GatewayEmailConfigService } from './gateway-email-config.service';
import { GatewayEmailRuntimeService } from './gateway-email-runtime.service';
import {
  GATEWAY_EMAIL_TRANSPORT,
  type GatewayEmailTransport,
} from './gateway-email-transport';
import { GatewayEmailMetricsService } from './observability/gateway-email-metrics.service';

@Injectable()
export class GatewayEmailSyncService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(GatewayEmailSyncService.name);
  private isSyncing = false;
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(
    private readonly assistantApiClientService: GatewayEmailAssistantApiClientService,
    private readonly gatewayEmailConfigService: GatewayEmailConfigService,
    private readonly gatewayEmailRuntimeService: GatewayEmailRuntimeService,
    private readonly metricsService: GatewayEmailMetricsService,
    @Inject(GATEWAY_EMAIL_TRANSPORT)
    private readonly transport: GatewayEmailTransport,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      void this.syncIfDue();
    }, 1000);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async triggerSync(): Promise<{ processed: number; status: string }> {
    return this.performSync();
  }

  private async syncIfDue(): Promise<void> {
    if (this.isSyncing) {
      return;
    }

    const config = await this.gatewayEmailConfigService.read();

    if (!this.gatewayEmailConfigService.isReady(config)) {
      return;
    }

    const state = await this.gatewayEmailRuntimeService.readState();
    const lastCompletedAt =
      typeof state.last_sync_completed_at === 'string'
        ? Date.parse(state.last_sync_completed_at)
        : null;
    const delayMs = config.sync_delay_seconds * 1000;

    if (lastCompletedAt !== null && Date.now() - lastCompletedAt < delayMs) {
      return;
    }

    await this.performSync();
  }

  private async performSync(): Promise<{ processed: number; status: string }> {
    if (this.isSyncing) {
      return { processed: 0, status: 'busy' };
    }

    this.isSyncing = true;

    try {
      const config = await this.gatewayEmailConfigService.read();

      if (!this.gatewayEmailConfigService.isReady(config)) {
        return { processed: 0, status: 'not_configured' };
      }

      const state = await this.gatewayEmailRuntimeService.readState();
      await this.gatewayEmailRuntimeService.markSyncStarted();
      const result = await this.transport.syncInbox(config, state.last_seen_uid);
      this.metricsService.recordUpstreamRequest('imap', true);

      let processed = 0;

      for (const inboundMessage of result.messages) {
        this.metricsService.recordIncomingMessage('imap');
        const ingestion = await this.gatewayEmailRuntimeService.ingestInbound('INBOX', inboundMessage);

        if (ingestion.duplicate || inboundMessage.text.trim().length === 0) {
          continue;
        }

        await this.assistantApiClientService.sendConversation({
          contact: ingestion.thread.contact || inboundMessage.from,
          conversationId: ingestion.conversation_id,
          mailbox: ingestion.thread.mailbox,
          message: inboundMessage.text,
        });
        processed += 1;
      }

      await this.gatewayEmailRuntimeService.markSyncCompleted(result.last_seen_uid);
      this.metricsService.setThreadCount((await this.gatewayEmailRuntimeService.listThreads()).length);
      this.metricsService.recordSync(true);

      return {
        processed,
        status: 'synced',
      };
    } catch (error) {
      this.metricsService.recordUpstreamRequest('imap', false);
      this.metricsService.recordSync(false);
      this.logger.warn(`Email sync failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        processed: 0,
        status: 'error',
      };
    } finally {
      this.isSyncing = false;
    }
  }
}
