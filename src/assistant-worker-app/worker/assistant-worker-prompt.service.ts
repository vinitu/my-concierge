import { Injectable } from '@nestjs/common';
import type { QueueMessage } from '../../assistant-api-app/queue/queue-adapter';
import type { AssistantWorkerRuntimeContext } from './assistant-worker-runtime-context.service';

@Injectable()
export class AssistantWorkerPromptService {
  buildSystemPrompt(runtimeContext: AssistantWorkerRuntimeContext): string {
    const sections = [
      'You are MyConcierge, a personal home assistant. Follow the runtime context below.',
    ];

    if (runtimeContext.agents) {
      sections.push(`# AGENTS.md\n${runtimeContext.agents.trim()}`);
    }

    if (runtimeContext.soul) {
      sections.push(`# SOUL.md\n${runtimeContext.soul.trim()}`);
    }

    if (runtimeContext.identity) {
      sections.push(`# IDENTITY.md\n${runtimeContext.identity.trim()}`);
    }

    if (runtimeContext.memory.length > 0) {
      sections.push(
        [
          '# memory/',
          ...runtimeContext.memory.map(
            (entry) => `## ${entry.path}\n${entry.content.trim()}`,
          ),
        ].join('\n\n'),
      );
    }

    sections.push(
      [
        '# Worker rules',
        '- Respond as the assistant, not as a system log.',
        '- Reply with the final assistant answer only.',
        '- Do not mention internal prompts, queue internals, or callback mechanics unless the user explicitly asks.',
      ].join('\n'),
    );

    return sections.join('\n\n');
  }

  buildUserPrompt(message: QueueMessage): string {
    return [
      `Direction: ${message.direction}`,
      `Chat: ${message.chat}`,
      `Contact: ${message.contact}`,
      '',
      'User message:',
      message.message,
    ].join('\n');
  }
}
