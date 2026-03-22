import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { AssistantApiAppModule } from './assistant-api-app/assistant-api-app.module';
import { AssistantWorkerAppModule } from './assistant-worker-app/assistant-worker-app.module';

async function bootstrap(): Promise<void> {
  const appRole = process.env.APP_ROLE ?? 'gateway-web';
  const appModule =
    appRole === 'assistant-api'
      ? AssistantApiAppModule
      : appRole === 'assistant-worker'
        ? AssistantWorkerAppModule
        : AppModule;
  const app = await NestFactory.create<NestExpressApplication>(appModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });
  const port = Number.parseInt(process.env.PORT ?? '3000', 10);
  let shuttingDown = false;

  app.enableCors();
  app.enableShutdownHooks();

  if (appRole === 'gateway-web') {
    app.useStaticAssets(join(process.cwd(), 'public'));
  }

  await app.listen(port, '0.0.0.0');

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
