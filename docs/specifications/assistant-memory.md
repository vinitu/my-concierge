# Specification: assistant-memory

## Purpose

`assistant-memory` owns durable conversation state, profile state, and typed memory storage. It exposes typed APIs for reads, writes, search, archive, compaction, and reindex operations.

## Responsibilities

- Store and return assistant profile data.
- Store typed memory kinds including `preference`, `fact`, `routine`, `project`, `episode`, and `rule`.
- Provide federated search and typed search APIs.
- Own canonical conversation history and summary state.
- Trigger asynchronous enrichment and asynchronous conversation summarization after conversation append.
- Expose `/status`, `/metrics`, and `/openapi.json`.

## Constraints

- Durable conversation and memory storage must be owned only by this service.
- Conversation APIs must use canonical fields such as `direction`, `user_id`, `conversation_id`, `request_id`, and `accepted_at`.
- Enrichment and conversation summarization must happen asynchronously after conversation writes.

## API Contract

- `GET /v1/profile`, `PUT /v1/profile`, `DELETE /v1/profile`
- `POST /v1/search`
  Federated search across typed memory kinds.
- For each typed memory kind:
  `POST /v1/<kind-plural>/search`
  `POST /v1/<kind-plural>/write`
  `GET /v1/<kind-plural>/:memoryId`
  `POST /v1/<kind-plural>/:memoryId/archive`
- `POST /v1/compact`
- `POST /v1/reindex`
- `GET /v1/conversations`
- `POST /v1/conversations/read`
- `POST /v1/conversations/append`
- `GET /status`, `GET /metrics`, `GET /openapi.json`

## Internal Flows

- Support file-backed storage for tests and MySQL-backed storage for canonical runtime data.
- Accept optional idempotency keys on typed writes.
- Append raw user and assistant turns immediately, then enqueue asynchronous summarization and enrichment.
- Conversation append must not wait for summary generation.
- Enrichment may call `assistant-llm` to extract facts and profile updates from new conversation state.
- Summarization may call `assistant-llm` to refresh the rolling conversation context from stored messages.
- Rolling conversation summary must exclude assistant fallback/error replies and must not preserve internal model failure text as user-facing conversation context.

## Dependencies

- MySQL as the canonical persistent store.
- File store support for local tests/runtime fallback.
- `assistant-llm` for asynchronous summary and enrichment extraction tasks.

## Metrics

- HTTP request duration/status metrics.
- Memory write/search/archive counters by kind.
- Conversation append/read counters.
- Enrichment queue and processing counters.
