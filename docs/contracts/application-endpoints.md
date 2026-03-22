# Contract: Application Endpoints

## Goal

Describe the endpoints of all application services in one place.

## Shared Rules

- All runtime components expose `GET /status`.
- All runtime components expose `GET /metrics`.
- `assistant-api` and `assistant-worker` also expose `GET /openapi.json`.
- `assistant-worker` does not expose public conversation endpoints.

## `assistant-api`

### Endpoints

- `POST /conversation/<direction>/<chat>/<contact>`
  Purpose: accept a conversation event, validate it, write it to the queue, and return an acceptance response
- `GET /status`
  Purpose: report `assistant-api` readiness
- `GET /metrics`
  Purpose: return Prometheus metrics, including queue depth
- `GET /openapi.json`
  Purpose: return the `assistant-api` OpenAPI schema

### Notes

- The detailed request and response contract is in `docs/contracts/conversation-api.md`.
- `assistant-api` does not run assistant business logic.

## `assistant-worker`

### Endpoints

- `GET /status`
  Purpose: report `assistant-worker` readiness
- `GET /metrics`
  Purpose: return Prometheus worker metrics
- `GET /openapi.json`
  Purpose: return the `assistant-worker` OpenAPI schema

### Notes

- `assistant-worker` reads jobs from the queue.
- `assistant-worker` sends callback messages after processing.

## `gateway-telegram`

### Endpoints

- `POST /inbound/telegram`
  Purpose: receive inbound Telegram events and convert them into `assistant-api` requests
- `POST /callbacks/assistant`
  Purpose: receive callback messages from `assistant-worker` and send them to Telegram
- `GET /status`
  Purpose: report `gateway-telegram` readiness
- `GET /metrics`
  Purpose: return Prometheus gateway metrics

### Notes

- Telegram callbacks should target `gateway-telegram`.
- The callback payload contract is in `docs/contracts/callback-api.md`.

## `gateway-email`

### Endpoints

- `POST /inbound/email`
  Purpose: receive inbound Email events and convert them into `assistant-api` requests
- `POST /callbacks/assistant`
  Purpose: receive callback messages from `assistant-worker` and send them by Email
- `GET /status`
  Purpose: report `gateway-email` readiness
- `GET /metrics`
  Purpose: return Prometheus gateway metrics

### Notes

- Email callbacks should target `gateway-email`.
- The callback payload contract is in `docs/contracts/callback-api.md`.

## `gateway-web`

### Endpoints

- `GET /`
  Purpose: return the simple Web chat page
- `GET /openapi.json`
  Purpose: return the `gateway-web` OpenAPI schema
- `WS /ws`
  Purpose: accept browser chat messages and return assistant replies through the same WebSocket session
- `POST /callbacks/assistant/:contact`
  Purpose: receive callback messages from `assistant-worker` and send them to the browser through WebSocket
- `GET /status`
  Purpose: report `gateway-web` readiness
- `GET /metrics`
  Purpose: return Prometheus gateway metrics

### Notes

- Web callbacks should target `gateway-web`.
- The browser does not call `assistant-api` directly.
- `gateway-web` exposes its own OpenAPI schema for the shared Swagger UI.
- The callback payload contract is in `docs/contracts/callback-api.md`.

## `scheduler`

### Endpoints

- `GET /status`
  Purpose: report `scheduler` readiness
- `GET /metrics`
  Purpose: return Prometheus scheduler metrics

### Notes

- `scheduler` triggers `assistant-api` on cron schedules.
- `scheduler` does not expose conversation intake endpoints.

## `swagger`

### Endpoints

- `GET /`
  Purpose: show one shared Swagger UI for `assistant-api`, `assistant-worker`, and `gateway-web`

### Notes

- `swagger` reads schemas from `http://localhost:3000/openapi.json`.
- `swagger` reads schemas from `http://localhost:3001/openapi.json`.
- `swagger` reads schemas from `http://localhost:8080/openapi.json`.

## `queue`

### Endpoints

- No project HTTP endpoints

### Notes

- `queue` is an internal transport component between `assistant-api` and `assistant-worker`.
- Queue depth must still appear in `assistant-api -> GET /metrics`.
