# Contract: Queue Message

## Purpose

Describe the queued job shape between `assistant-api` and `assistant-worker`.

## Minimum Fields

- `direction`
- `chat`
- `contact`
- `conversation_id`
- `host`
- `message`

## Rules

- `assistant-api` writes this message.
- `assistant-worker` reads this message.
- `assistant-worker` derives callback endpoints from `host` and `conversation_id`.
- The queue contract should stay stable across retries and scaling.
