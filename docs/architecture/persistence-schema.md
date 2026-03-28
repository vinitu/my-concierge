# Persistence Schema

## Goal

Describe the canonical MySQL schema for conversation state and durable memory.

## Ownership

- `assistant-worker` owns conversation tables
- `assistant-memory` owns durable memory tables
- both domains live in the same MySQL deployment

## Conversation Tables

### `conversation_threads`

One row per canonical conversation.

Required columns:

- `id` `varchar(64)` primary key
- `direction` `varchar(32)` not null
- `chat` `varchar(64)` not null
- `contact` `varchar(255)` not null
- `status` `varchar(32)` not null default `'active'`
- `created_at` `datetime(3)` not null
- `updated_at` `datetime(3)` not null
- `last_message_at` `datetime(3)` null

Indexes:

- unique index on `direction, chat, contact`
- index on `updated_at`

### `conversation_turns`

One row per persisted message or assistant reply.

Required columns:

- `id` `varchar(64)` primary key
- `thread_id` `varchar(64)` not null
- `run_id` `varchar(64)` null
- `role` `varchar(32)` not null
- `message` `text` not null
- `sequence_no` `bigint` not null
- `created_at` `datetime(3)` not null

Foreign keys:

- `thread_id` references `conversation_threads(id)`

Indexes:

- unique index on `thread_id, sequence_no`
- index on `run_id`
- index on `created_at`

### `conversation_summaries`

One current rolling summary per conversation thread.

Required columns:

- `thread_id` `varchar(64)` primary key
- `summary` `text` not null
- `summary_version` `bigint` not null default `1`
- `updated_at` `datetime(3)` not null

Foreign keys:

- `thread_id` references `conversation_threads(id)`

## Durable Memory Tables

### `user_profile`

Singleton canonical profile for the household.

Required columns:

- `id` `varchar(64)` primary key
- `language` `varchar(32)` null
- `timezone` `varchar(64)` null
- `home_json` `json` not null
- `preferences_json` `json` not null
- `constraints_json` `json` not null
- `updated_at` `datetime(3)` not null

### `memory_entries`

Canonical durable memory records.

Required columns:

- `id` `varchar(64)` primary key
- `kind` `varchar(32)` not null
- `scope` `varchar(64)` not null
- `content` `text` not null
- `source` `varchar(128)` not null
- `confidence` `decimal(5,4)` not null
- `conversation_thread_id` `varchar(64)` null
- `last_accessed_at` `datetime(3)` null
- `created_at` `datetime(3)` not null
- `updated_at` `datetime(3)` not null
- `archived_at` `datetime(3)` null

Foreign keys:

- `conversation_thread_id` references `conversation_threads(id)`

Indexes:

- index on `kind, scope`
- index on `archived_at`
- index on `updated_at`
- index on `conversation_thread_id`

### `memory_entry_tags`

Normalized tags for memory retrieval filters.

Required columns:

- `entry_id` `varchar(64)` not null
- `tag` `varchar(64)` not null

Foreign keys:

- `entry_id` references `memory_entries(id)`

Indexes:

- unique index on `entry_id, tag`
- index on `tag`

### `memory_idempotency_keys`

Deduplicate `memory_write` requests.

Required columns:

- `idempotency_key` `varchar(128)` primary key
- `request_hash` `char(64)` not null
- `response_json` `json` not null
- `created_at` `datetime(3)` not null
- `expires_at` `datetime(3)` not null

### `schema_migrations`

Applied MySQL migrations.

Required columns:

- `version` `bigint` primary key
- `name` `varchar(255)` not null
- `applied_at` `datetime(3)` not null

## Schema Rules

- `assistant-worker` writes only to conversation tables
- `assistant-memory` writes only to memory tables
- durable memory rows are archived, not hard-deleted, during normal operations
- timestamps use UTC with millisecond precision
- ids must be generated outside MySQL so services can remain idempotent across retries
- schema changes must be applied through versioned MySQL migrations

## Related Documents

- [Memory Architecture](./memory.md)
- [assistant-worker](../services/assistant/assistant-worker.md)
- [assistant-memory](../services/assistant/assistant-memory.md)
