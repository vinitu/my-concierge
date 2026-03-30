import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { AssistantApiAppModule } from './assistant-api-app/assistant-api-app.module';
import { AssistantLlmAppModule } from './assistant-llm-app/assistant-llm-app.module';
import { AssistantMemoryAppModule } from './assistant-memory-app/assistant-memory-app.module';
import { AssistantOrchestratorAppModule } from './assistant-orchestrator-app/assistant-orchestrator-app.module';
import { AssistantSchedulerAppModule } from './assistant-scheduler-app/assistant-scheduler-app.module';
import { DashboardAppModule } from './dashboard-app/dashboard-app.module';
import { GatewayEmailAppModule } from './gateway-email-app/gateway-email-app.module';
import { GatewayTelegramAppModule } from './gateway-telegram-app/gateway-telegram-app.module';

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function wsHandshakeStatusLine(statusCode: number, statusMessage: string): string {
  return `HTTP/1.1 ${String(statusCode)} ${statusMessage}\r\n`;
}

function writeBadGateway(socket: Socket): void {
  socket.write(
    `${wsHandshakeStatusLine(502, 'Bad Gateway')}Connection: close\r\nContent-Length: 0\r\n\r\n`,
  );
  socket.destroy();
}

function writeSwitchingProtocols(
  socket: Socket,
  upstreamResponse: IncomingMessage,
): void {
  const statusCode = upstreamResponse.statusCode ?? 101;
  const statusMessage = upstreamResponse.statusMessage ?? 'Switching Protocols';
  const lines = [wsHandshakeStatusLine(statusCode, statusMessage)];

  for (const [key, value] of Object.entries(upstreamResponse.headers)) {
    if (typeof value === 'undefined') {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        lines.push(`${key}: ${item}\r\n`);
      }
      continue;
    }

    lines.push(`${key}: ${value}\r\n`);
  }

  lines.push('\r\n');
  socket.write(lines.join(''));
}

function attachDashboardGatewayWebSocketProxy(
  app: NestExpressApplication,
): void {
  const upstreamBaseUrl = trimTrailingSlash(
    process.env.DASHBOARD_GATEWAY_WEB_UPSTREAM_URL ?? 'http://gateway-web:3000',
  );
  const upstreamUrl = new URL(upstreamBaseUrl);
  const proxyRequest = upstreamUrl.protocol === 'https:' ? httpsRequest : httpRequest;
  const httpServer = app.getHttpServer();

  httpServer.on(
    'upgrade',
    (request: IncomingMessage, socket: Socket, head: Buffer) => {
      const requestUrl = request.url ?? '';

      if (!requestUrl.startsWith('/gateway-web/ws')) {
        return;
      }

      const upstreamPath = requestUrl.replace('/gateway-web', '') || '/ws';
      const upstreamRequest = proxyRequest(
        {
          host: upstreamUrl.hostname,
          method: 'GET',
          path: upstreamPath,
          port:
            upstreamUrl.port.length > 0
              ? Number.parseInt(upstreamUrl.port, 10)
              : upstreamUrl.protocol === 'https:'
                ? 443
                : 80,
          headers: {
            ...request.headers,
            host: upstreamUrl.host,
          },
        },
      );

      upstreamRequest.on(
        'upgrade',
        (upstreamResponse: IncomingMessage, upstreamSocket: Socket, upstreamHead: Buffer) => {
          writeSwitchingProtocols(socket, upstreamResponse);

          if (head.length > 0) {
            upstreamSocket.write(head);
          }

          if (upstreamHead.length > 0) {
            socket.write(upstreamHead);
          }

          socket.pipe(upstreamSocket).pipe(socket);
        },
      );

      upstreamRequest.on('error', () => {
        writeBadGateway(socket);
      });

      upstreamRequest.end();
    },
  );
}

async function bootstrap(): Promise<void> {
  const appRole = process.env.APP_ROLE ?? 'gateway-web';
  const appModule =
    appRole === 'assistant-api'
      ? AssistantApiAppModule
      : appRole === 'assistant-llm'
        ? AssistantLlmAppModule
      : appRole === 'assistant-orchestrator'
        ? AssistantOrchestratorAppModule
        : appRole === 'assistant-memory'
          ? AssistantMemoryAppModule
        : appRole === 'assistant-scheduler'
          ? AssistantSchedulerAppModule
        : appRole === 'gateway-email'
          ? GatewayEmailAppModule
        : appRole === 'gateway-telegram'
          ? GatewayTelegramAppModule
        : appRole === 'dashboard'
          ? DashboardAppModule
        : AppModule;
  const app = await NestFactory.create<NestExpressApplication>(appModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });
  const port = Number.parseInt(process.env.PORT ?? '3000', 10);
  let shuttingDown = false;

  app.enableCors();
  app.enableShutdownHooks();

  if (appRole === 'gateway-web') {
    app.useStaticAssets(join(process.cwd(), 'public'), {
      index: false,
    });
  }

  await app.listen(port, '0.0.0.0');

  if (appRole === 'dashboard') {
    attachDashboardGatewayWebSocketProxy(app);
  }

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    await app.close();
    process.exit(0);
  };

  process.once('SIGTERM', () => {
    void shutdown();
  });

  process.once('SIGINT', () => {
    void shutdown();
  });
}

void bootstrap();
