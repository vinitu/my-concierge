# System Components

## Goal

Describe the main components and their boundaries.

## Components

- `assistant-api`
- `queue`
- `assistant-worker`
- `gateway-telegram`
- `gateway-email`
- `gateway-web`
- `scheduler`
- `swagger`
- `prometheus`

## Component Rules

### `assistant-api`

- Public API entry point
- Validates requests
- Writes accepted work to the queue
- Exposes `GET /status`
- Exposes `GET /metrics`
- Exposes `GET /openapi.json`
- Does not run assistant business logic

### `queue`

- Transport layer between `assistant-api` and `assistant-worker`
- Stores accepted jobs until a worker reads them

### `assistant-worker`

- Reads jobs from the queue
- Runs assistant business logic
- Calls LLM providers and shared integrations
- Sends callback requests
- Exposes `GET /status`
- Exposes `GET /metrics`
- Exposes `GET /openapi.json`

### `gateway-telegram`

- Receives Telegram events
- Calls `assistant-api`
- Receives callback messages for Telegram
- Exposes `GET /status`
- Exposes `GET /metrics`

### `gateway-email`

- Receives Email events
- Calls `assistant-api`
- Receives callback messages for Email
- Exposes `GET /status`
- Exposes `GET /metrics`

### `gateway-web`

- Serves a simple Web chat page
- Accepts WebSocket messages from the browser
- Calls `assistant-api`
- Receives callback messages for the Web chat
- Sends assistant replies back through WebSocket
- Exposes `GET /status`
- Exposes `GET /metrics`

### `scheduler`

- Runs cron-based jobs
- Calls `assistant-api`
- Stops after the job is accepted for queueing
- Exposes `GET /status`
- Exposes `GET /metrics`

### `swagger`

- Reads OpenAPI from `assistant-api`
- Reads OpenAPI from `assistant-worker`
- Shows both schemas in one UI

## Boundary Rules

- Channel components stay thin.
- `assistant-api` stays thin.
- Assistant business logic lives in `assistant-worker`.
- `assistant-api` and `assistant-worker` communicate only through the queue.
- `assistant-api` does not send replies to gateways.
- `scheduler` only triggers work and does not receive assistant replies.
