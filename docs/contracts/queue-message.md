# Contract: Queue Message

## Purpose

Describe the queued job shape between `assistant-api` and `assistant-worker`.

## Minimum Fields

- `direction`
- `chat`
- `contact`
- `message`
- `callback_url`

## Rules

- `assistant-api` writes this message.
- `assistant-worker` reads this message.
- The queue contract should stay stable across retries and scaling.
