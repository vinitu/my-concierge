import { Injectable } from '@nestjs/common';

export interface AssistantToolDescriptor {
  description: string;
  name: string;
  use_when: string;
}

@Injectable()
export class AssistantToolCatalogService {
  listTools(): AssistantToolDescriptor[] {
    return [
      {
        description: 'Return current date, time, and timezone-aware temporal context.',
        name: 'time_current',
        use_when: 'Current time or date is required to answer correctly.',
      },
      {
        description: 'Search durable memory for relevant profile, fact, preference, project, routine, rule, or episode entries.',
        name: 'memory_search',
        use_when: 'The answer depends on stable remembered facts or preferences not present in recent messages.',
      },
      {
        description: 'Store durable memory candidates after the run passes memory write policy.',
        name: 'memory_write',
        use_when: 'New stable memory should be persisted after a run completes.',
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
  }
}
