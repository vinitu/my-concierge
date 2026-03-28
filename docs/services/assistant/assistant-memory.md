# Service: assistant-memory

## Purpose

`assistant-memory` is the dedicated durable memory service for `assistant`.
It owns memory retrieval, memory writes, profile storage, and memory maintenance.

Architecture details:

- durable memory flow: [memory.md](../../architecture/memory.md)

## Status

This document describes the canonical `assistant-memory` service.

## Responsibilities

- Store durable assistant memory
- Store the canonical user and household profile
- Search memory entries for the current run
- Validate and persist memory write requests
- Deduplicate and compact memory records
- Archive stale memory without destructive deletion
- Rebuild retrieval metadata when needed
- Expose operational endpoints

## Relations

```mermaid
flowchart LR
    Worker["assistant-worker"] <--> Memory["assistant-memory"]
    Memory --> MySQL["mysql"]
```

Rules:

- `assistant-worker` calls `assistant-memory` for memory reads and writes
- `assistant-memory` owns the memory tables in MySQL
- `assistant-memory` does not talk to gateways
- `assistant-memory` does not consume Redis jobs directly

## Memory Types

`assistant-memory` exposes one singleton profile resource and six durable memory entry kinds.

### `profile`

The canonical structured profile for the user and household.

Definition:

- a singleton structured object, not a list of separate memory entries
- contains stable top-level metadata reused across many runs
- should hold normalized fields, not free-form narrative text

Examples:

- `language = "en"`
- `timezone = "Europe/Warsaw"`
- `home.city = "Warsaw"`
- `preferences.response_style = "concise"`

Storage rule:

- stored as a dedicated profile document, not as a generic memory entry

### `preference`

Stable likes, dislikes, and recurring style choices.

Definition:

- a stable user preference that should influence future behavior
- subjective by nature
- should not be used for one-off decisions or temporary mood

Examples:

- `Prefers concise replies`
- `Prefers Telegram over email for quick notifications`
- `Usually buys groceries from Biedronka`

### `fact`

Stable factual information the assistant should remember.

Definition:

- an objective, stable statement expected to remain true until changed
- should describe the world of the user, household, devices, accounts, or setup
- should not encode a preference or policy as a fact

Examples:

- `Uses a Synology NAS at home`
- `Primary workstation is a Mac`
- `Current assistant stack uses MySQL for canonical persistence`

### `routine`

Recurring habits, schedules, and repeated behaviors.

Definition:

- a repeated pattern rather than a one-time event
- useful for reminders, planning, and proactive timing
- should describe cadence or habit, not just one scheduled reminder

Examples:

- `Reviews inbox every morning`
- `Checks household expenses every Sunday`
- `Runs weekly server maintenance on Friday evening`

### `project`

Longer-lived ongoing efforts with evolving state.

Definition:

- an initiative that spans multiple conversations and changes over time
- should be used when future turns need current project context
- may be updated repeatedly as milestones change

Examples:

- `Agent runtime redesign for MyConcierge`
- `Gateway-email implementation with IMAP and SMTP`
- `Migration from file-based storage to MySQL`

### `episode`

Important past events summarized for future use.

Definition:

- a concise memory of a specific past discussion, decision, or event
- useful later, but not a permanent profile attribute
- should usually be tied to time, context, or an outcome

Examples:

- `On 2026-03-27, callbacks were assigned only to assistant-api`
- `Decided one email chain maps to one conversation_id`
- `Chose LangChain.js as the only assistant-worker runtime`

### `rule`

Persistent rules and constraints the assistant should obey.

Definition:

- an explicit instruction, policy, or hard constraint
- higher priority than ordinary facts during retrieval and execution
- may come from the user or from accepted architecture decisions

Examples:

- `Use MySQL instead of PostgreSQL`
- `Only assistant-api may deliver external callbacks`
- `Do not write speculative memory entries`

## Type Selection Rules

Choose the type by intent:

- use `profile` for singleton structured user metadata
- use `preference` for subjective stable choices
- use `fact` for objective stable information
- use `routine` for recurring patterns
- use `project` for active long-running efforts
- use `episode` for notable past events and decisions
- use `rule` for constraints and instructions

Avoid these mistakes:

- do not store a preference as a `fact`
- do not store a one-time event as a `routine`
- do not store a permanent setting as an `episode`
- do not store project progress as a `fact` when it changes over time

## Endpoints

### Operational Endpoints

| Endpoint | Purpose |
|---------|---------|
| `GET /status` | Service readiness |
| `GET /metrics` | Prometheus metrics |
| `GET /openapi.json` | OpenAPI schema |

### Profile Endpoints

| Endpoint | Purpose |
|---------|---------|
| `GET /v1/profile` | Return the canonical profile |
| `PUT /v1/profile` | Replace or merge profile data |

### Memory Endpoints

| Endpoint | Purpose |
|---------|---------|
| `POST /v1/search` | Federated search across all memory kinds |
| `POST /v1/preferences/search` | Search `preference` entries |
| `POST /v1/preferences/write` | Validate and persist `preference` entries |
| `GET /v1/preferences/:memoryId` | Fetch one `preference` entry |
| `POST /v1/preferences/:memoryId/archive` | Archive one `preference` entry |
| `POST /v1/facts/search` | Search `fact` entries |
| `POST /v1/facts/write` | Validate and persist `fact` entries |
| `GET /v1/facts/:memoryId` | Fetch one `fact` entry |
| `POST /v1/facts/:memoryId/archive` | Archive one `fact` entry |
| `POST /v1/routines/search` | Search `routine` entries |
| `POST /v1/routines/write` | Validate and persist `routine` entries |
| `GET /v1/routines/:memoryId` | Fetch one `routine` entry |
| `POST /v1/routines/:memoryId/archive` | Archive one `routine` entry |
| `POST /v1/projects/search` | Search `project` entries |
| `POST /v1/projects/write` | Validate and persist `project` entries |
| `GET /v1/projects/:memoryId` | Fetch one `project` entry |
| `POST /v1/projects/:memoryId/archive` | Archive one `project` entry |
| `POST /v1/episodes/search` | Search `episode` entries |
| `POST /v1/episodes/write` | Validate and persist `episode` entries |
| `GET /v1/episodes/:memoryId` | Fetch one `episode` entry |
| `POST /v1/episodes/:memoryId/archive` | Archive one `episode` entry |
| `POST /v1/rules/search` | Search `rule` entries |
| `POST /v1/rules/write` | Validate and persist `rule` entries |
| `GET /v1/rules/:memoryId` | Fetch one `rule` entry |
| `POST /v1/rules/:memoryId/archive` | Archive one `rule` entry |
| `POST /v1/compact` | Deduplicate and compact memory |
| `POST /v1/reindex` | Rebuild retrieval metadata |

## Endpoint Contracts

All write endpoints must accept an `Idempotency-Key` request header.
If the same key is retried with the same request body, the service must return the original response.
If the same key is reused with a different body, the service must return `409 Conflict`.

### `GET /v1/profile`

Status:

- `200 OK`

Response body:

```json
{
  "language": "en",
  "timezone": "Europe/Warsaw",
  "home": {},
  "preferences": {},
  "constraints": {},
  "updatedAt": "2026-03-27T10:00:00.000Z"
}
```

### `PUT /v1/profile`

Status:

- `200 OK`
- `400 Bad Request`
- `409 Conflict`

Request body:

```json
{
  "language": "en",
  "timezone": "Europe/Warsaw",
  "home": {},
  "preferences": {},
  "constraints": {},
  "source": "assistant-worker"
}
```

Response body:

```json
{
  "status": "updated",
  "updatedProfile": {
    "language": "en",
    "timezone": "Europe/Warsaw",
    "home": {},
    "preferences": {},
    "constraints": {}
  },
  "updatedAt": "2026-03-27T10:00:00.000Z"
}
```

### `POST /v1/search`

Federated search across all memory kinds.

Request body:

```json
{
  "query": "callbacks",
  "kinds": ["rule", "episode"],
  "conversationThreadId": "thread_123",
  "limit": 8
}
```

Response body:

```json
{
  "count": 1,
  "entries": [
    {
      "id": "mem_123",
      "kind": "rule",
      "content": "Only assistant-api may deliver external callbacks.",
      "score": 1.28,
      "reason": "direct text match in rule"
    }
  ]
}
```

### Typed endpoints

Each durable memory kind exposes the same endpoint shape:

- `POST /v1/<kind-plural>/search`
- `POST /v1/<kind-plural>/write`
- `GET /v1/<kind-plural>/:memoryId`
- `POST /v1/<kind-plural>/:memoryId/archive`

Kinds:

- `preferences`
- `facts`
- `routines`
- `projects`
- `episodes`
- `rules`

Example typed write:

```json
{
  "entries": [
    {
      "content": "Prefers concise replies.",
      "confidence": 0.92,
      "conversationThreadId": "thread_123",
      "scope": "conversation",
      "source": "assistant-worker",
      "tags": ["style"]
    }
  ]
}
```

### `POST /v1/compact`

Compacts exact duplicates across active entries and archives redundant copies.

### `POST /v1/reindex`

Rebuilds retrieval metadata without changing the external memory contract.

## Error Contract

Error responses use:

```json
{
  "statusCode": 400,
  "message": "query must not be empty",
  "error": "Bad Request"
}
```

## Tool Mapping

Inside `assistant-worker`, the main tool-to-service mapping is:

- `memory_search` -> `POST /v1/search`
- `memory_write` -> typed write endpoints grouped by memory kind

Profile operations remain deterministic application logic.
They are not model-callable tools.

## Storage Model

`assistant-memory` owns the memory-related tables in MySQL.
The canonical schema is defined in [persistence-schema.md](../../architecture/persistence-schema.md).
Schema changes must be applied through `npm run db:migrate`.

## Write Policy

`assistant-memory` must not store every candidate blindly.

Write only when one of these is true:

- the user explicitly asked to remember something
- the system learned a stable preference or fact
- an important episode should influence future behavior
- an active project state changed meaningfully

Reject or archive when:

- the candidate is low-confidence
- the information is speculative
- the value is just raw tool output
- the memory is clearly stale or superseded

## Must Not Do

- Run LangChain.js agent loops
- Own conversation state
- Send callbacks to gateways
- Consume public inbound requests from channels
- Expose raw MySQL access to the model

## Metrics

| Metric | Type | Labels | Description |
|---------|---------|---------|-------------|
| `memory_request_duration_ms` | `histogram` | `endpoint`, `response_code` | HTTP request duration in milliseconds |
| `memory_search_total` | `counter` | `kind`, `status` | Total number of memory search requests |
| `memory_write_total` | `counter` | `kind`, `status` | Total number of memory write attempts |
| `memory_archive_total` | `counter` | `kind`, `status` | Total number of archive operations |
| `memory_compact_total` | `counter` | `status` | Total number of compaction operations |
| `memory_reindex_total` | `counter` | `status` | Total number of reindex operations |
| `memory_entries_total` | `gauge` | `kind` | Current number of active memory entries |
| `memory_validation_failures_total` | `counter` | `kind`, `reason` | Total number of rejected write candidates |

## Related Documents

- [assistant](../assistant.md)
- [Memory Architecture](../../architecture/memory.md)
- [Persistence Schema](../../architecture/persistence-schema.md)
