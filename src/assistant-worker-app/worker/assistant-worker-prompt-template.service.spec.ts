import { ConfigService } from '@nestjs/config';
import {
  mkdtemp,
  mkdir,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssistantWorkerPromptService } from './assistant-worker-prompt.service';
import { AssistantWorkerPromptTemplateService } from './assistant-worker-prompt-template.service';
import type { AssistantWorkerRuntimeContext } from './assistant-worker-runtime-context.service';

describe('AssistantWorkerPromptTemplateService', () => {
  const runtimeContext: AssistantWorkerRuntimeContext = {
    agents: '["agent rules"]',
    datadir: '/runtime',
    identity: '["assistant identity"]',
    memory: [
      {
        content: 'remember this',
        path: 'memory/profile.md',
      },
    ],
    soul: `[
  "Stay calm in the dialogue.",
  "Preserve a natural conversational tone.",
  "Be direct and practical.",
  "Keep responses concise by default.",
  "Be helpful without unnecessary explanation."
]`,
  };

  it('renders assistant system prompt from repository template', async () => {
    const promptsdir = await mkdtemp(join(tmpdir(), 'assistant-worker-prompts-'));
    await mkdir(promptsdir, { recursive: true });
    await writeFile(
      join(promptsdir, 'user-prompt.md'),
      'HEADER\n{{request}}\nFOOTER\n',
      'utf8',
    );
    const service = new AssistantWorkerPromptTemplateService(
      new ConfigService({
        ASSISTANT_PROMPTS_DIR: promptsdir,
      }),
      new AssistantWorkerPromptService(),
    );

    await expect(
      service.renderAssistantSystemPrompt(
        {
          conversation: {
            chat: 'direct',
            contact: 'alex',
            context: 'Current conversation context',
            direction: 'api',
            messages: [
              {
                content: 'hello',
                created_at: '2026-03-22T10:00:00.000Z',
                role: 'user',
              },
            ],
            updated_at: null,
          },
          message: {
            callback_url: 'http://example.test/callback',
            chat: 'direct',
            contact: 'alex',
            direction: 'api',
            message: 'current message',
          },
        },
        runtimeContext,
      ),
    ).resolves.toContain(
      '"system_instructions": [',
    );
    await expect(
      service.renderAssistantSystemPrompt(
        {
          conversation: {
            chat: 'direct',
            contact: 'alex',
            context: 'Current conversation context',
            direction: 'api',
            messages: [
              {
                content: 'hello',
                created_at: '2026-03-22T10:00:00.000Z',
                role: 'user',
              },
            ],
            updated_at: null,
          },
          message: {
            callback_url: 'http://example.test/callback',
            chat: 'direct',
            contact: 'alex',
            direction: 'api',
            message: 'current message',
          },
        },
        runtimeContext,
      ),
    ).resolves.toContain(
      '"identity": [',
    );
    await expect(
      service.renderAssistantSystemPrompt(
        {
          conversation: {
            chat: 'direct',
            contact: 'alex',
            context: 'Current conversation context',
            direction: 'api',
            messages: [
              {
                content: 'hello',
                created_at: '2026-03-22T10:00:00.000Z',
                role: 'user',
              },
            ],
            updated_at: null,
          },
          message: {
            callback_url: 'http://example.test/callback',
            chat: 'direct',
            contact: 'alex',
            direction: 'api',
            message: 'current message',
          },
        },
        runtimeContext,
      ),
    ).resolves.toContain('"message": "current message"');
  });

});
