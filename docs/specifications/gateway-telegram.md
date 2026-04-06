# Specification: gateway-telegram

## Purpose

`gateway-telegram` is the Telegram channel adapter. It stores local thread state, accepts inbound Telegram messages, forwards user text to `assistant-api`, and sends assistant replies through the Telegram Bot API.

## Responsibilities

- Accept inbound Telegram payloads and deduplicate them into local thread state.
- Forward accepted inbound text to `assistant-api`.
- Deliver assistant callback replies through the Telegram transport with reply context.
- Expose thread listing endpoints and operational endpoints.

## Constraints

- Must preserve reply context such as `chat_id`, `reply_to_message_id`, and optional `message_thread_id`.
- Must not own queue, LLM, or durable memory logic.
- Must not bypass `assistant-api` for new inbound user requests.

## API Contract

- `GET /threads`
- `GET /threads/:conversationId`
- `POST /inbound/telegram`
- `POST /response/:conversationId`
- `POST /thinking/:conversationId`
- `POST /tool/:conversationId`
- `GET /config`, `PUT /config`
- `GET /status`, `GET /metrics`, `GET /openapi.json`

## Internal Flows

- Normalize inbound Telegram payloads, store/update the local thread, and detect duplicates.
- Forward non-empty accepted inbound text to `assistant-api`.
- Resolve reply context from the thread store before sending a Bot API message.
- Keep Telegram runtime data under `runtime/gateway-telegram/`.

## Dependencies

- `assistant-api`
- Telegram Bot API transport.
- Local runtime directory under `runtime/gateway-telegram/`.

## Metrics

- HTTP request duration/status metrics.
- Incoming Telegram message counters.
- Callback delivery counters.
- Upstream request counters for Telegram API.
- Thread count gauge.
