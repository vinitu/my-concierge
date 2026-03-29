export interface MysqlMigration {
  name: string;
  statements: string[];
  version: number;
}

export const MYSQL_MIGRATIONS: MysqlMigration[] = [
  {
    name: 'initial_conversation_and_memory_schema',
    version: 1,
    statements: [
      `
        CREATE TABLE IF NOT EXISTS conversation_threads (
          id VARCHAR(64) PRIMARY KEY,
          direction VARCHAR(32) NOT NULL,
          chat VARCHAR(64) NOT NULL,
          contact VARCHAR(255) NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'active',
          created_at DATETIME(3) NOT NULL,
          updated_at DATETIME(3) NOT NULL,
          last_message_at DATETIME(3) NULL,
          UNIQUE KEY uniq_conversation_route (direction, chat, contact),
          KEY idx_conversation_threads_updated_at (updated_at)
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS conversation_turns (
          id VARCHAR(64) PRIMARY KEY,
          thread_id VARCHAR(64) NOT NULL,
          run_id VARCHAR(64) NULL,
          role VARCHAR(32) NOT NULL,
          message TEXT NOT NULL,
          sequence_no BIGINT NOT NULL,
          created_at DATETIME(3) NOT NULL,
          CONSTRAINT fk_conversation_turns_thread
            FOREIGN KEY (thread_id) REFERENCES conversation_threads(id),
          UNIQUE KEY uniq_conversation_turn_sequence (thread_id, sequence_no),
          KEY idx_conversation_turns_run_id (run_id),
          KEY idx_conversation_turns_created_at (created_at)
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS conversation_summaries (
          thread_id VARCHAR(64) PRIMARY KEY,
          summary TEXT NOT NULL,
          summary_version BIGINT NOT NULL DEFAULT 1,
          updated_at DATETIME(3) NOT NULL,
          CONSTRAINT fk_conversation_summaries_thread
            FOREIGN KEY (thread_id) REFERENCES conversation_threads(id)
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS user_profile (
          id VARCHAR(64) PRIMARY KEY,
          language VARCHAR(32) NULL,
          timezone VARCHAR(64) NULL,
          home_json JSON NOT NULL,
          preferences_json JSON NOT NULL,
          constraints_json JSON NOT NULL,
          updated_at DATETIME(3) NOT NULL
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS memory_entries (
          id VARCHAR(64) PRIMARY KEY,
          kind VARCHAR(32) NOT NULL,
          scope VARCHAR(64) NOT NULL,
          content TEXT NOT NULL,
          source VARCHAR(128) NOT NULL,
          confidence DECIMAL(5,4) NOT NULL,
          conversation_thread_id VARCHAR(64) NULL,
          last_accessed_at DATETIME(3) NULL,
          created_at DATETIME(3) NOT NULL,
          updated_at DATETIME(3) NOT NULL,
          archived_at DATETIME(3) NULL,
          KEY idx_memory_entries_kind_scope (kind, scope),
          KEY idx_memory_entries_archived_at (archived_at),
          KEY idx_memory_entries_updated_at (updated_at),
          KEY idx_memory_entries_thread_id (conversation_thread_id)
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS memory_entry_tags (
          entry_id VARCHAR(64) NOT NULL,
          tag VARCHAR(64) NOT NULL,
          UNIQUE KEY uniq_memory_tag (entry_id, tag),
          KEY idx_memory_tag (tag)
        )
      `,
      `
        CREATE TABLE IF NOT EXISTS memory_idempotency_keys (
          idempotency_key VARCHAR(128) PRIMARY KEY,
          request_hash CHAR(64) NOT NULL,
          response_json JSON NOT NULL,
          created_at DATETIME(3) NOT NULL,
          expires_at DATETIME(3) NOT NULL
        )
      `,
    ],
  },
  {
    name: 'drop_conversation_route_uniqueness',
    version: 2,
    statements: [
      `
        DROP INDEX uniq_conversation_route
        ON conversation_threads
      `,
    ],
  },
  {
    name: 'remove_conversation_turns_run_id',
    version: 3,
    statements: [
      `
        DROP INDEX idx_conversation_turns_run_id
        ON conversation_turns
      `,
      `
        ALTER TABLE conversation_turns
        DROP COLUMN run_id
      `,
    ],
  },
];

export const REQUIRED_SCHEMA_TABLES = [
  'conversation_summaries',
  'conversation_threads',
  'conversation_turns',
  'memory_entries',
  'memory_entry_tags',
  'memory_idempotency_keys',
  'schema_migrations',
  'user_profile',
];
