import { Injectable } from '@nestjs/common';

export const SUPPORTED_ASSISTANT_TOOL_NAMES = [
  'time_current',
  'web_search',
  'mem_search',
  'mem_preference_search',
  'mem_fact_search',
  'mem_routine_search',
  'mem_project_search',
  'mem_episode_search',
  'mem_rule_search',
  'mem_preference_write',
  'mem_fact_write',
  'mem_routine_write',
  'mem_project_write',
  'mem_episode_write',
  'mem_rule_write',
  'mem_conversation_search',
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
      name: 'mem_search',
      use_when:
        'Use first when you need memory retrieval but the target kind is not yet clear.',
    },
    {
      description: 'Search preference memory entries (subjective stable preferences).',
      name: 'mem_preference_search',
      use_when: 'Use when the answer depends on user preferences.',
    },
    {
      description: 'Search fact memory entries (objective stable facts).',
      name: 'mem_fact_search',
      use_when: 'Use when the answer depends on stable objective facts.',
    },
    {
      description: 'Search routine memory entries (repeated patterns).',
      name: 'mem_routine_search',
      use_when: 'Use when the answer depends on recurring routines.',
    },
    {
      description: 'Search project memory entries (active long-lived context).',
      name: 'mem_project_search',
      use_when: 'Use when the answer depends on project state or progress.',
    },
    {
      description: 'Search episode memory entries (important past events and decisions).',
      name: 'mem_episode_search',
      use_when: 'Use when the answer depends on past episodes in the thread history.',
    },
    {
      description: 'Search rule memory entries (instructions and constraints).',
      name: 'mem_rule_search',
      use_when: 'Use when the answer depends on explicit rules or constraints.',
    },
    {
      description: 'Write preference memory entries.',
      name: 'mem_preference_write',
      use_when: 'Persist stable user preferences.',
    },
    {
      description: 'Write fact memory entries.',
      name: 'mem_fact_write',
      use_when: 'Persist stable objective facts.',
    },
    {
      description: 'Write routine memory entries.',
      name: 'mem_routine_write',
      use_when: 'Persist recurring routines.',
    },
    {
      description: 'Write project memory entries.',
      name: 'mem_project_write',
      use_when: 'Persist active project context.',
    },
    {
      description: 'Write episode memory entries.',
      name: 'mem_episode_write',
      use_when: 'Persist important episodic events.',
    },
    {
      description: 'Write rule memory entries.',
      name: 'mem_rule_write',
      use_when: 'Persist explicit instructions or constraints.',
    },
    {
      description: 'Search recent canonical conversation turns and summaries for the current thread.',
      name: 'mem_conversation_search',
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
