# Specification: gateway-web

## Purpose

`gateway-web` provides the browser chat UI and WebSocket bridge for assistant conversations.

## Responsibilities

- Serve the browser chat page and static assets.
- Maintain a cookie-backed conversation/session identifier.
- Accept browser chat messages over WebSocket and forward them to `assistant-api`.
- Accept callback deliveries for `response`, `thinking`, `tool`, and `event` message types.
- Expose `/config`, `/status`, `/metrics`, and `/openapi.json`.

## Constraints

- Must not call `assistant-orchestrator` directly.
- Must not own queue, LLM, or durable memory logic.
- Must filter incoming callback message types according to runtime config.

## API Contract

- `GET /`
  Chat page HTML.
- `GET /status`
- `GET /metrics`
- `GET /openapi.json`
- `GET /config`, `PUT /config`
  Runtime settings for allowed incoming callback types and related UI behavior.
- `POST /response/:conversationId`
- `POST /thinking/:conversationId`
- `POST /tool/:conversationId`
- `POST /event/:conversationId`
- `WS /ws`
  WebSocket channel for browser chat and assistant updates.

## Internal Flows

- Create or restore a conversation cookie on page load.
- Forward chat messages to `assistant-api` with canonical `conversation_id` and `user_id`.
- Fan callback deliveries back to the active WebSocket session for the matching conversation.
- Render run, memory, and tool activity in one browser event stream alongside normal chat messages.
- Persist lightweight local runtime conversation artifacts under `runtime/gateway-web/`.

## Dependencies

- `assistant-api`
- Local runtime directory under `runtime/gateway-web/`.

## Metrics

- HTTP request duration/status metrics.
- WebSocket connection and message counters.
- Callback delivery counters.
- Endpoint request counters.
