export type MemoryKind =
  | 'episode'
  | 'fact'
  | 'preference'
  | 'project'
  | 'routine'
  | 'rule';

export interface AssistantProfile {
  constraints: Record<string, unknown>;
  home: Record<string, unknown>;
  language: string | null;
  preferences: Record<string, unknown>;
  timezone: string | null;
  updatedAt: string | null;
}

export interface MemoryEntry {
  archivedAt: string | null;
  confidence: number;
  content: string;
  conversationThreadId: string | null;
  createdAt: string;
  id: string;
  kind: MemoryKind;
  lastAccessedAt: string | null;
  scope: string;
  score?: number;
  source: string;
  tags: string[];
  updatedAt: string;
}

export interface MemorySearchEntry extends MemoryEntry {
  reason?: string;
}

export interface BaseMemorySearchRequest {
  conversationThreadId?: string;
  limit?: number;
  query: string;
  recencyWindowDays?: number;
  scopes?: string[];
  tags?: string[];
}

export interface FederatedMemorySearchRequest extends BaseMemorySearchRequest {
  kinds?: MemoryKind[];
}

export interface TypedMemorySearchRequest extends BaseMemorySearchRequest {}

export interface MemorySearchResponse {
  count: number;
  entries: MemorySearchEntry[];
}

export interface BaseMemoryWriteCandidate {
  confidence: number;
  content: string;
  conversationThreadId?: string;
  scope: string;
  source: string;
  tags?: string[];
}

export interface PreferenceWriteCandidate extends BaseMemoryWriteCandidate {}
export interface FactWriteCandidate extends BaseMemoryWriteCandidate {}
export interface RoutineWriteCandidate extends BaseMemoryWriteCandidate {}
export interface ProjectWriteCandidate extends BaseMemoryWriteCandidate {}
export interface EpisodeWriteCandidate extends BaseMemoryWriteCandidate {}
export interface RuleWriteCandidate extends BaseMemoryWriteCandidate {}

export interface MemoryWriteCandidate extends BaseMemoryWriteCandidate {
  kind: MemoryKind;
}

export interface MemoryWriteResult {
  created: number;
  entries: MemoryEntry[];
  updated: number;
}

export interface MemoryWriteRequest<TCandidate extends BaseMemoryWriteCandidate> {
  entries: TCandidate[];
}

export interface ProfileUpdateRequest {
  constraints?: Record<string, unknown>;
  home?: Record<string, unknown>;
  language?: string | null;
  preferences?: Record<string, unknown>;
  source: string;
  timezone?: string | null;
}

export interface ProfileUpdateResponse {
  status: 'updated';
  updatedAt: string;
  updatedProfile: AssistantProfile;
}

export interface MemoryArchiveResponse {
  archivedAt: string;
  id: string;
  kind: MemoryKind;
  status: 'archived';
}

export interface MemoryCompactResponse {
  archived: number;
  status: 'compacted';
}

export interface MemoryReindexResponse {
  indexed: number;
  status: 'reindexed';
}
