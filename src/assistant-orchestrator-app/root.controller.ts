import {
  Body,
  Controller,
  Get,
  Header,
  Put,
} from '@nestjs/common';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AssistantLlmProviderStatus } from './worker/assistant-llm-provider-status';
import { AssistantLlmClientService } from './worker/assistant-llm-client.service';
import {
  AssistantOrchestratorConfigService,
  type AssistantOrchestratorConfig,
} from './worker/assistant-orchestrator-config.service';
import {
  type AssistantToolName,
  AssistantToolCatalogService,
} from './worker/assistant-tool-catalog.service';
import {
  type AssistantConversationThreadListItem,
  AssistantOrchestratorConversationService,
} from './worker/assistant-orchestrator-conversation.service';

interface UpdateOrchestratorConfigBody {
  brave_api_key?: string;
  brave_base_url?: string;
  brave_timeout_ms?: number | string;
  enabled_tools?: string[];
  max_tool_steps?: number | string;
  memory_window?: number | string;
  run_timeout_seconds?: number | string;
  thinking_interval_seconds?: number | string;
}

@Controller()
export class AssistantOrchestratorRootController {
  constructor(
    private readonly assistantOrchestratorConfigService: AssistantOrchestratorConfigService,
    private readonly assistantLlmClientService: AssistantLlmClientService,
    private readonly assistantToolCatalogService: AssistantToolCatalogService,
    private readonly conversationService: AssistantOrchestratorConversationService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getRoot(): Promise<string> {
    const config = await this.assistantOrchestratorConfigService.read();
    const providerStatus = await this.safeProviderStatus();
    const skills = await this.listLocalSkillFiles();
    const conversations = await this.safeListConversations();

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>assistant-orchestrator</title>
    <style>
      body { font-family: sans-serif; margin: 2rem; line-height: 1.5; }
      code { background: #f4f4f4; padding: 0.1rem 0.3rem; border-radius: 4px; }
      ul { margin-top: 0.5rem; }
    </style>
  </head>
  <body>
    <h1>assistant-orchestrator</h1>
    <p>Runtime orchestration service (queue, tools, callbacks).</p>
    <p><strong>Provider status:</strong> ${this.escapeHtml(providerStatus.status)}</p>
    <p><strong>Memory window:</strong> ${String(config.memory_window)}</p>
    <p><strong>Max tool steps:</strong> ${String(config.max_tool_steps)}</p>
    <p><strong>Enabled tools:</strong> ${this.escapeHtml(config.enabled_tools.join(', '))}</p>
    <h3>Endpoints</h3>
    <ul>
      <li><a href="/config">/config</a></li>
      <li><a href="/provider">/provider</a></li>
      <li><a href="/models">/models</a></li>
      <li><a href="/skills">/skills</a></li>
      <li><a href="/conversations">/conversations</a></li>
      <li><a href="/status">/status</a></li>
      <li><a href="/openapi.json">/openapi.json</a></li>
    </ul>
    <h3>Skills</h3>
    <ul>${skills.map((skill) => `<li>${this.escapeHtml(skill)}</li>`).join('') || '<li>No local skills</li>'}</ul>
    <h3>Conversations</h3>
    <ul>${conversations.map((thread) => `<li>${this.escapeHtml(thread.thread_id)} (${this.escapeHtml(thread.chat)})</li>`).join('') || '<li>No conversations</li>'}</ul>
  </body>
</html>`;
  }

  @Get('config')
  getConfig(): Promise<AssistantOrchestratorConfig> {
    return this.assistantOrchestratorConfigService.read();
  }

  @Put('config')
  async updateConfig(
    @Body() body: UpdateOrchestratorConfigBody,
  ): Promise<AssistantOrchestratorConfig> {
    return this.assistantOrchestratorConfigService.write({
      brave_api_key: typeof body.brave_api_key === 'string' ? body.brave_api_key : '',
      brave_base_url: typeof body.brave_base_url === 'string' ? body.brave_base_url : '',
      brave_timeout_ms:
        typeof body.brave_timeout_ms === 'number'
          ? body.brave_timeout_ms
          : typeof body.brave_timeout_ms === 'string'
            ? Number.parseInt(body.brave_timeout_ms, 10)
            : 30000,
      enabled_tools: this.normalizeEnabledTools(body.enabled_tools),
      max_tool_steps:
        typeof body.max_tool_steps === 'number'
          ? body.max_tool_steps
          : typeof body.max_tool_steps === 'string'
            ? Number.parseInt(body.max_tool_steps, 10)
            : 4,
      memory_window:
        typeof body.memory_window === 'number'
          ? body.memory_window
          : typeof body.memory_window === 'string'
            ? Number.parseInt(body.memory_window, 10)
            : 6,
      run_timeout_seconds:
        typeof body.run_timeout_seconds === 'number'
          ? body.run_timeout_seconds
          : typeof body.run_timeout_seconds === 'string'
            ? Number.parseInt(body.run_timeout_seconds, 10)
            : 30,
      thinking_interval_seconds:
        typeof body.thinking_interval_seconds === 'number'
          ? body.thinking_interval_seconds
          : typeof body.thinking_interval_seconds === 'string'
            ? Number.parseInt(body.thinking_interval_seconds, 10)
            : 2,
    });
  }

  @Get('provider')
  getProviderStatus(): Promise<AssistantLlmProviderStatus> {
    return this.assistantLlmClientService.providerStatus();
  }

  @Get('models')
  async getModels(): Promise<Record<string, unknown>> {
    return {
      models: await this.assistantLlmClientService.models(),
    };
  }

  @Get('skills')
  async getSkills(): Promise<{ skills: string[] }> {
    return {
      skills: await this.listLocalSkillFiles(),
    };
  }

  @Get('conversations')
  async getConversations(): Promise<{ count: number; threads: AssistantConversationThreadListItem[] }> {
    const threads = await this.safeListConversations();
    return {
      count: threads.length,
      threads,
    };
  }

  private normalizeEnabledTools(value: unknown): AssistantToolName[] {
    if (Array.isArray(value)) {
      const normalized = value.filter((entry): entry is AssistantToolName =>
        this.assistantToolCatalogService.isSupportedToolName(entry),
      );
      return [...new Set(normalized)];
    }
    return this.assistantToolCatalogService.listToolNames();
  }

  private async listLocalSkillFiles(): Promise<string[]> {
    const configPath = this.assistantOrchestratorConfigService.configPath();
    const skillsDirectory = join(dirname(configPath), '..', 'skills');
    try {
      const entries = await readdir(skillsDirectory, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  }

  private async safeProviderStatus(): Promise<AssistantLlmProviderStatus> {
    try {
      return await this.assistantLlmClientService.providerStatus();
    } catch (error) {
      return {
        enabled: false,
        model: '',
        provider: 'ollama',
        status: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async safeListConversations(): Promise<AssistantConversationThreadListItem[]> {
    try {
      return await this.conversationService.listConversations();
    } catch {
      return [];
    }
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
