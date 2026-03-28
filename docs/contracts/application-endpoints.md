# Contract: Application Endpoints

## Goal

Describe the endpoints of all application services in one place.

## Shared Rules

- All runtime components expose `GET /status`.
- All runtime components expose `GET /metrics`.
- `assistant-api`, `assistant-worker`, `assistant-memory`, `dashboard`, `gateway-web`, `gateway-email`, and `gateway-telegram` also expose `GET /openapi.json`.
- `GET /status` should include `service`, `status`, `ready`, and `uptime_seconds`.
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
- `assistant-api` owns external callback delivery.

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
- `assistant-worker` publishes run events back to the queue.
- `assistant-worker` does not call gateway callback endpoints directly.

## `assistant-memory`

### Endpoints

- `GET /status`
  Purpose: report `assistant-memory` readiness
- `GET /metrics`
  Purpose: return Prometheus memory metrics
- `GET /openapi.json`
  Purpose: return the `assistant-memory` OpenAPI schema
- `GET /v1/profile`
  Purpose: return the canonical profile
- `PUT /v1/profile`
  Purpose: replace or merge profile data
- `POST /v1/search`
  Purpose: federated search across all memory kinds
- `POST /v1/preferences/search`
  Purpose: search `preference` entries
- `POST /v1/preferences/write`
  Purpose: validate and persist `preference` entries
- `GET /v1/preferences/:memoryId`
  Purpose: fetch one `preference` entry
- `POST /v1/preferences/:memoryId/archive`
  Purpose: archive one `preference` entry
- `POST /v1/facts/search`
  Purpose: search `fact` entries
- `POST /v1/facts/write`
  Purpose: validate and persist `fact` entries
- `GET /v1/facts/:memoryId`
  Purpose: fetch one `fact` entry
- `POST /v1/facts/:memoryId/archive`
  Purpose: archive one `fact` entry
- `POST /v1/routines/search`
  Purpose: search `routine` entries
- `POST /v1/routines/write`
  Purpose: validate and persist `routine` entries
- `GET /v1/routines/:memoryId`
  Purpose: fetch one `routine` entry
- `POST /v1/routines/:memoryId/archive`
  Purpose: archive one `routine` entry
- `POST /v1/projects/search`
  Purpose: search `project` entries
- `POST /v1/projects/write`
  Purpose: validate and persist `project` entries
- `GET /v1/projects/:memoryId`
  Purpose: fetch one `project` entry
- `POST /v1/projects/:memoryId/archive`
  Purpose: archive one `project` entry
- `POST /v1/episodes/search`
  Purpose: search `episode` entries
- `POST /v1/episodes/write`
  Purpose: validate and persist `episode` entries
- `GET /v1/episodes/:memoryId`
  Purpose: fetch one `episode` entry
- `POST /v1/episodes/:memoryId/archive`
  Purpose: archive one `episode` entry
- `POST /v1/rules/search`
  Purpose: search `rule` entries
- `POST /v1/rules/write`
  Purpose: validate and persist `rule` entries
- `GET /v1/rules/:memoryId`
  Purpose: fetch one `rule` entry
- `POST /v1/rules/:memoryId/archive`
  Purpose: archive one `rule` entry
- `POST /v1/compact`
  Purpose: compact and deduplicate memory
- `POST /v1/reindex`
  Purpose: rebuild retrieval metadata

### Notes

- `assistant-memory` is an internal service.
- `assistant-worker` calls `assistant-memory` for durable memory operations.

## `gateway-telegram`

### Endpoints

- `GET /`
  Purpose: show the Telegram gateway web panel
- `GET /config`
  Purpose: read stored Telegram gateway configuration
- `PUT /config`
  Purpose: update the Telegram Bot token
- `GET /threads`
  Purpose: list locally stored Telegram threads from the gateway runtime
- `GET /threads/:conversationId`
  Purpose: read one locally stored Telegram thread from the gateway runtime
- `POST /inbound/telegram`
  Purpose: receive inbound Telegram events and convert them into `assistant-api` requests
- `POST /response/:conversationId`
  Purpose: receive the final assistant response from `assistant-api` and send it as a Telegram reply
- `POST /thinking/:conversationId`
  Purpose: receive a transient thinking callback for a Telegram thread and acknowledge it
- `GET /status`
  Purpose: report `gateway-telegram` readiness
- `GET /metrics`
  Purpose: return Prometheus gateway metrics
- `GET /openapi.json`
  Purpose: return the `gateway-telegram` OpenAPI schema

### Notes

- Telegram callbacks should target `gateway-telegram` from `assistant-api`.
- `gateway-telegram` maintains its own local chat runtime with threads and message copies.
- One Telegram chat or topic maps to one stable `conversation_id`.
- The callback payload contract is in `docs/contracts/callback-api.md`.

## `gateway-email`

### Endpoints

- `GET /`
  Purpose: show the email gateway web panel
- `GET /config`
  Purpose: read stored email gateway configuration
- `PUT /config`
  Purpose: update the mailbox address, password, IMAP settings, SMTP settings, and sync delay
- `GET /threads`
  Purpose: list locally stored email threads from the gateway runtime
- `GET /threads/:conversationId`
  Purpose: read one locally stored email thread from the gateway runtime
- `POST /sync`
  Purpose: trigger one mailbox sync immediately
- `POST /inbound/email`
  Purpose: receive inbound Email events and convert them into `assistant-api` requests
- `POST /response/:conversationId`
  Purpose: receive the final assistant response from `assistant-api` and send it as an email reply
- `POST /thinking/:conversationId`
  Purpose: receive a transient thinking callback for an email thread and acknowledge it
- `GET /status`
  Purpose: report `gateway-email` readiness
- `GET /metrics`
  Purpose: return Prometheus gateway metrics
- `GET /openapi.json`
  Purpose: return the `gateway-email` OpenAPI schema

### Notes

- Email callbacks should target `gateway-email` from `assistant-api`.
- `gateway-email` maintains its own mailbox runtime with thread state and message copies.
- One email chain maps to one stable `conversation_id`.
- The callback payload contract is in `docs/contracts/callback-api.md`.

## `dashboard`

### Endpoints

- `GET /`
  Purpose: show the aggregated service dashboard with links, `UP/DOWN` tiles, and uptimes
- `GET /services/status`
  Purpose: return aggregated service statuses for asynchronous dashboard refresh
- `GET /status`
  Purpose: report `dashboard` readiness
- `GET /metrics`
  Purpose: return Prometheus dashboard metrics
- `GET /openapi.json`
  Purpose: return the `dashboard` OpenAPI schema

### Notes

- `dashboard` talks to runtime services over HTTP only.
- `dashboard` polls service status endpoints every `DASHBOARD_REFRESH_SECONDS`.
- `dashboard` is the main browser entrypoint in the current local stack.

## `gateway-web`

### Endpoints

- `GET /`
  Purpose: return the simple Web chat page
- `GET /openapi.json`
  Purpose: return the `gateway-web` OpenAPI schema
- `WS /ws`
  Purpose: accept browser chat messages and return assistant replies through the same WebSocket session
- `POST /response/:conversationId`
  Purpose: receive the final assistant response from `assistant-api` and send it to the browser through WebSocket
- `POST /thinking/:conversationId`
  Purpose: receive transient thinking callbacks from `assistant-api` and show them in the browser for the requested number of seconds
- `GET /status`
  Purpose: report `gateway-web` readiness
- `GET /metrics`
  Purpose: return Prometheus gateway metrics

### Notes

- Web callbacks should target `gateway-web`.
- The browser does not call `assistant-api` directly.
- `gateway-web` exposes its own OpenAPI schema for the shared Swagger UI.
- The callback payload contract is in `docs/contracts/callback-api.md`.

## `assistant-scheduler`

### Endpoints

- `GET /status`
  Purpose: report `assistant-scheduler` readiness
- `GET /metrics`
  Purpose: return Prometheus `assistant-scheduler` metrics

### Notes

- `assistant-scheduler` triggers `assistant-api` on cron schedules.
- `assistant-scheduler` does not expose conversation intake endpoints.

## `swagger`

### Endpoints

- `GET /`
  Purpose: show one shared Swagger UI for `assistant-api`, `assistant-worker`, `assistant-memory`, `dashboard`, `gateway-web`, `gateway-telegram`, and `gateway-email`

### Notes

- `swagger` reads schemas from `http://localhost:3000/openapi.json`.
- `swagger` reads schemas from `http://localhost:3001/openapi.json`.
- `swagger` reads schemas from `http://assistant-memory:3000/openapi.json`.
- `swagger` reads schemas from `http://localhost:8080/openapi.json`.
- `swagger` reads schemas from `http://localhost:8079/openapi.json`.
- `swagger` reads schemas from `http://localhost:8081/openapi.json`.
- `swagger` reads schemas from `http://localhost:8082/openapi.json`.

## `prometheus`

### Endpoints

- `GET /-/healthy`
  Purpose: report Prometheus health
- `GET /-/ready`
  Purpose: report Prometheus readiness
- `GET /api/v1/query`
  Purpose: run an instant metrics query
- `GET /api/v1/query_range`
  Purpose: run a range metrics query
- `GET /api/v1/targets`
  Purpose: show scrape target status

### Notes

- `prometheus` scrapes `/metrics` from runtime services.
- Runtime services do not push metrics to `prometheus`.

## `queue`

### Endpoints

- No project HTTP endpoints

### Notes

- `queue` is an internal transport component between `assistant-api` and `assistant-worker` in both directions.
- Queue depth must still appear in `assistant-api -> GET /metrics`.
