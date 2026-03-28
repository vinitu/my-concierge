import { Injectable } from '@nestjs/common';

export const SUPPORTED_ASSISTANT_TOOL_NAMES = [
  'time_current',
  'web_search',
  'memory_search_federated',
  'memory_search_preference',
  'memory_search_fact',
  'memory_search_routine',
  'memory_search_project',
  'memory_search_episode',
  'memory_search_rule',
  'memory_write_preference',
  'memory_write_fact',
  'memory_write_routine',
  'memory_write_project',
  'memory_write_episode',
  'memory_write_rule',
  'conversation_search',
  'skill_execute',
] as const;

export type AssistantToolName = (typeof SUPPORTED_ASSISTANT_TOOL_NAMES)[number];

export interface AssistantToolDescriptor {
  description: string;
  name: AssistantToolName;
  use_when: string;
}

@Injectable()
export class AssistantToolCatalogService {
  private readonly toolDescriptors: AssistantToolDescriptor[] = [
    {
      description: 'Return current date, time, and timezone-aware temporal context.',
      name: 'time_current',
      use_when: 'Current time or date is required to answer correctly.',
    },
    {
      description: 'Search the web for current external information and source links.',
      name: 'web_search',
      use_when: 'The answer depends on fresh public web information or external sources.',
    },
    {
      description: 'Search durable memory across all kinds (federated fallback when kind is unknown).',
      name: 'memory_search_federated',
      use_when:
        'Use first when you need memory retrieval but the target kind is not yet clear.',
    },
    {
      description: 'Search preference memory entries (subjective stable preferences).',
      name: 'memory_search_preference',
      use_when: 'Use when the answer depends on user preferences.',
    },
    {
      description: 'Search fact memory entries (objective stable facts).',
      name: 'memory_search_fact',
      use_when: 'Use when the answer depends on stable objective facts.',
    },
    {
      description: 'Search routine memory entries (repeated patterns).',
      name: 'memory_search_routine',
      use_when: 'Use when the answer depends on recurring routines.',
    },
    {
      description: 'Search project memory entries (active long-lived context).',
      name: 'memory_search_project',
      use_when: 'Use when the answer depends on project state or progress.',
    },
    {
      description: 'Search episode memory entries (important past events and decisions).',
      name: 'memory_search_episode',
      use_when: 'Use when the answer depends on past episodes in the thread history.',
    },
    {
      description: 'Search rule memory entries (instructions and constraints).',
      name: 'memory_search_rule',
      use_when: 'Use when the answer depends on explicit rules or constraints.',
    },
    {
      description: 'Write preference memory entries.',
      name: 'memory_write_preference',
      use_when: 'Persist stable user preferences.',
    },
    {
      description: 'Write fact memory entries.',
      name: 'memory_write_fact',
      use_when: 'Persist stable objective facts.',
    },
    {
      description: 'Write routine memory entries.',
      name: 'memory_write_routine',
      use_when: 'Persist recurring routines.',
    },
    {
      description: 'Write project memory entries.',
      name: 'memory_write_project',
      use_when: 'Persist active project context.',
    },
    {
      description: 'Write episode memory entries.',
      name: 'memory_write_episode',
      use_when: 'Persist important episodic events.',
    },
    {
      description: 'Write rule memory entries.',
      name: 'memory_write_rule',
      use_when: 'Persist explicit instructions or constraints.',
    },
    {
      description: 'Search recent canonical conversation turns and summaries for the current thread.',
      name: 'conversation_search',
      use_when: 'Recent thread context must be reloaded beyond the current in-memory window.',
    },
    {
      description: 'Execute a registered assistant skill or integration action.',
      name: 'skill_execute',
      use_when: 'The assistant must call a skill or integration to complete the task.',
    },
  ];

  listTools(enabledTools?: AssistantToolName[]): AssistantToolDescriptor[] {
    if (!enabledTools || enabledTools.length === 0) {
      return [...this.toolDescriptors];
    }

    const enabledSet = new Set(enabledTools);
    return this.toolDescriptors.filter((tool) => enabledSet.has(tool.name));
  }

  listToolNames(): AssistantToolName[] {
    return [...SUPPORTED_ASSISTANT_TOOL_NAMES];
  }

  isSupportedToolName(value: unknown): value is AssistantToolName {
    return (
      typeof value === 'string' &&
      (SUPPORTED_ASSISTANT_TOOL_NAMES as readonly string[]).includes(value)
    );
  }
}
