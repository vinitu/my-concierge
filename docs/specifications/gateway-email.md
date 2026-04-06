# Specification: gateway-email

## Purpose

`gateway-email` is the email channel adapter. It keeps local mailbox thread state, accepts inbound email, forwards text requests to `assistant-api`, and sends assistant replies by SMTP with preserved thread headers.

## Responsibilities

- Accept inbound email payloads and deduplicate them into local thread state.
- Trigger mailbox sync through the configured transport.
- Forward accepted inbound email text to `assistant-api`.
- Deliver assistant callback replies by SMTP.
- Expose thread listing endpoints and operational endpoints.

## Constraints

- Must preserve email reply context such as `subject`, `in_reply_to`, and `references`.
- Must not own queue, LLM, or durable memory logic.
- Must not bypass `assistant-api` for new inbound user requests.

## API Contract

- `GET /threads`
- `GET /threads/:conversationId`
- `POST /sync`
- `POST /inbound/email`
- `POST /response/:conversationId`
- `POST /thinking/:conversationId`
- `POST /tool/:conversationId`
- `GET /config`, `PUT /config`
- `GET /status`, `GET /metrics`, `GET /openapi.json`

## Internal Flows

- Normalize inbound email payloads, store/update the local thread, and detect duplicates.
- Forward non-empty accepted inbound text to `assistant-api`.
- Resolve reply context from the thread store before sending SMTP replies.
- Keep mailbox runtime data under `runtime/gateway-email/`.

## Dependencies

- `assistant-api`
- Email transport for IMAP sync and SMTP delivery.
- Local runtime directory under `runtime/gateway-email/`.

## Metrics

- HTTP request duration/status metrics.
- Incoming email counters.
- Email sync counters.
- Callback delivery counters.
- Upstream request counters for IMAP/SMTP.
