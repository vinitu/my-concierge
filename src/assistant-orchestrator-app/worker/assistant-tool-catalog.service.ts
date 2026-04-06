import { Injectable } from '@nestjs/common';

export const SUPPORTED_ASSISTANT_TOOL_NAMES = [
  'time_current',
  'web_search',
  'memory_search',
  'memory_fact_search',
  'memory_fact_write',
  'memory_conversation_search',
  'skill_execute',
  'directory_list',
  'directory_create',
  'directory_delete',
  'file_delete',
  'file_write',
  'file_read',
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
      name: 'memory_search',
      use_when:
        'Use first when you need memory retrieval but the target kind is not yet clear.',
    },
    {
      description: 'Search fact memory entries (objective stable facts).',
      name: 'memory_fact_search',
      use_when: 'Use when the answer depends on stable objective facts.',
    },
    {
      description: 'Write fact memory entries.',
      name: 'memory_fact_write',
      use_when: 'Persist stable objective facts.',
    },
    {
      description: 'Search recent canonical conversation turns and summaries for the current thread.',
      name: 'memory_conversation_search',
      use_when: 'Recent thread context must be reloaded beyond the current in-memory window.',
    },
    {
      description: 'Execute a registered assistant skill or integration action.',
      name: 'skill_execute',
      use_when: 'The assistant must call a skill or integration to complete the task.',
    },
    {
      description: 'List files and directories inside the sandboxed assistant home directory.',
      name: 'directory_list',
      use_when: 'You need to inspect filesystem state inside the assistant sandbox.',
    },
    {
      description: 'Create one directory inside the sandboxed assistant home directory.',
      name: 'directory_create',
      use_when: 'A target directory inside the assistant sandbox must be created.',
    },
    {
      description: 'Delete one directory inside the sandboxed assistant home directory.',
      name: 'directory_delete',
      use_when: 'A directory inside the assistant sandbox should be removed.',
    },
    {
      description: 'Delete one file inside the sandboxed assistant home directory.',
      name: 'file_delete',
      use_when: 'A sandboxed file should be removed.',
    },
    {
      description: 'Write full text content to one file inside the sandboxed assistant home directory.',
      name: 'file_write',
      use_when: 'A file must be created or fully rewritten in the sandbox.',
    },
    {
      description: 'Read one text file inside the sandboxed assistant home directory.',
      name: 'file_read',
      use_when: 'You need the contents of an existing sandboxed file.',
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
