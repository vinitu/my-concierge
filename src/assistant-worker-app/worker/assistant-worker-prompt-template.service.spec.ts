import { AssistantToolCatalogService } from './assistant-tool-catalog.service';
import { AssistantWorkerPromptService } from './assistant-worker-prompt.service';
import { AssistantWorkerPromptTemplateService } from './assistant-worker-prompt-template.service';
import type { AssistantWorkerRuntimeContext } from './assistant-worker-runtime-context.service';

describe('AssistantWorkerPromptTemplateService', () => {
  const runtimeContext: AssistantWorkerRuntimeContext = {
    agents: '["agent rules"]',
    datadir: '/runtime',
    identity: null,
    memory: [
      {
        content: 'remember this',
        path: 'memory/profile.md',
      },
    ],
    soul: null,
  };

  it('renders planning prompt with request payload and structured format instructions', async () => {
    const service = new AssistantWorkerPromptTemplateService(
      new AssistantWorkerPromptService(new AssistantToolCatalogService()),
    );

    await expect(
      service.renderPlanningPrompt(
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
            accepted_at: new Date().toISOString(),
            callback: { base_url: 'http://example.test' },
            chat: 'direct',
            conversation_id: 'alex',
            contact: 'alex',
            direction: 'api',
            message: 'current message',
            request_id: 'req-1',
          },
          retrieved_memory: [],
        },
        runtimeContext,
      ),
    ).resolves.toContain('"system_instructions": [');
    await expect(
      service.renderPlanningPrompt(
        {
          conversation: {
            chat: 'direct',
            contact: 'alex',
            context: 'Current conversation context',
            direction: 'api',
            messages: [],
            updated_at: null,
          },
          message: {
            accepted_at: new Date().toISOString(),
            callback: { base_url: 'http://example.test' },
            chat: 'direct',
            conversation_id: 'alex',
            contact: 'alex',
            direction: 'api',
            message: 'current message',
            request_id: 'req-1',
          },
          retrieved_memory: [],
        },
        runtimeContext,
      ),
    ).resolves.toContain(
      'You are the planning phase of the assistant runtime.',
    );
  });

});
