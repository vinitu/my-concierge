# Specification: assistant-api

## Purpose

`assistant-api` is the canonical ingress service for assistant requests. It accepts typed conversation requests, assigns `request_id`, stores acceptance metadata, and places work onto the execution queue.

## Responsibilities

- Accept `POST /conversation/:direction/:chat/:userId` requests and return `202 accepted`.
- Validate `conversation_id` and `message` as non-empty strings.
- Create canonical queue messages with `direction`, `chat`, `user_id`, `conversation_id`, `request_id`, and `accepted_at`.
- Own external callback delivery for run events produced by `assistant-orchestrator`.
- Expose `/status`, `/metrics`, and `/openapi.json`.

## Constraints

- Must not execute LLM calls directly.
- Must not own model or provider settings.
- Must not write durable memory directly.
- Must keep canonical request field names. No legacy aliases.

## API Contract

- `POST /conversation/:direction/:chat/:userId`
  Request body: `{ "conversation_id": string, "message": string }`
  Response `202`: `{ "request_id": string, "status": "accepted" }`
  Response `400` when `conversation_id` or `message` is empty after trim.
- `GET /status`
  Response `200`: `{ "service": "assistant-api", "status": "ok", "ready": true, "queueAdapter": string, "uptime_seconds": number }`
- `GET /metrics`
  Prometheus text response.
- `GET /openapi.json`
  OpenAPI document for this service.

## Internal Flows

- Generate `request_id` on accept.
- Enqueue a canonical queue message through the selected queue adapter.
- Consume run events from the run-event queue and deliver callbacks to the configured gateway callback URLs.
- Callback payloads for `run.completed`, `run.failed`, `run.tool`, and `event` deliveries must preserve canonical `request_id` and `sequence` from the originating run event so gateways can render one run in deterministic order.
- Refresh queue-depth metrics after enqueue and queue processing events.

## Dependencies

- Queue adapter: file, memory, or Redis.
- Run-event consumer for `run.started`, `run.thinking`, `run.tool`, `run.completed`, and `run.failed`.
- External callback targets such as `gateway-web`, `gateway-telegram`, or `gateway-email`.

## Metrics

- HTTP request duration/status metrics.
- `accepted_messages_total`
- `queue_messages`
- Callback delivery counters and upstream request counters.
