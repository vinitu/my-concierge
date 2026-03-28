# Contract: Queue Message

## Purpose

Describe the Redis transport shapes between `assistant-api` and `assistant-worker`.

## Execution Job Minimum Fields

- `direction`
- `chat`
- `contact`
- `conversation_id`
- `message`
- callback routing identifiers
- `accepted_at`
- `request_id`

## Run Event Minimum Fields

- `runId`
- `conversationId`
- `channel`
- `eventType`
- `sequence`
- `payload`
- `createdAt`
- `requestId`

## Rules

- `assistant-api` writes execution jobs.
- `assistant-worker` reads execution jobs.
- `assistant-worker` writes run events.
- `assistant-api` reads run events.
- `assistant-worker` must not derive gateway callback endpoints directly.
- `request_id` is stable across execution retries for the same accepted request.
- `runId` is stable across all run events for the same execution attempt.
- `sequence` is monotonically increasing inside one `runId`.
- duplicate run events must be ignored by `assistant-api` when `runId` and `sequence` were already processed.
- the Redis transport contracts must stay stable across retries and scaling.
