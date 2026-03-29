import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AssistantLlmController } from './assistant-llm.controller';
import { AssistantLlmConfigService } from './assistant-llm-config.service';
import { AssistantLlmOpenApiController } from './openapi.controller';
import { AssistantLlmRootController } from './root.controller';
import { AssistantLlmService } from './assistant-llm.service';
import { AssistantLlmStatusController } from './status.controller';
import { DeepseekChatService } from './deepseek-chat.service';
import { DeepseekProviderStatusService } from './deepseek-provider-status.service';
import { GrokResponsesService } from './grok-responses.service';
import { OllamaChatService } from './ollama-chat.service';
import { OllamaProviderStatusService } from './ollama-provider-status.service';
import { XaiProviderStatusService } from './xai-provider-status.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [
    AssistantLlmController,
    AssistantLlmOpenApiController,
    AssistantLlmRootController,
    AssistantLlmStatusController,
  ],
  providers: [
    AssistantLlmConfigService,
    AssistantLlmService,
    DeepseekChatService,
    DeepseekProviderStatusService,
    GrokResponsesService,
    OllamaChatService,
    OllamaProviderStatusService,
    XaiProviderStatusService,
  ],
})
export class AssistantLlmAppModule {}
