# System Components

## Goal

Describe the main components and their boundaries.

## Components

- `assistant-api`
- `queue`
- `assistant-orchestrator`
- `assistant-llm`
- `assistant-memory`
- `gateway-telegram`
- `gateway-email`
- `gateway-web`
- `assistant-scheduler`
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

- Transport layer between `assistant-api` and `assistant-orchestrator`
- Stores accepted jobs and worker run events
- Supports Redis-based transport in both directions

### `assistant-orchestrator`

- Reads jobs from the queue
- Runs assistant business logic
- Loads assistant runtime context from the runtime directory
- Builds context for the current run
- Calls `assistant-llm` for generation and summarization
- Persists conversation state through `assistant-memory`
- Publishes run events back to the queue
- Exposes `GET /status`
- Exposes `GET /metrics`
- Exposes `GET /openapi.json`

### `assistant-memory`

- Owns durable memory retrieval and writes
- Owns canonical profile storage
- Validates memory writes
- Deduplicates and compacts memory
- Runs asynchronous post-append enrichment using `assistant-llm`
- Exposes `GET /status`
- Exposes `GET /metrics`
- Exposes `GET /openapi.json`

### `gateway-telegram`

- Exposes its own web panel for Telegram Bot configuration
- Receives Telegram events
- Maintains a local chat runtime with threads and message copies
- Calls `assistant-api`
- Receives `thinking` and `response` callbacks for Telegram threads
- Sends Telegram Bot API replies with preserved reply context
- Exposes `GET /status`
- Exposes `GET /metrics`
- Exposes `GET /openapi.json`

### `gateway-email`

- Exposes its own web panel for mailbox configuration
- Receives Email events
- Maintains a local mailbox runtime with threads and message copies
- Syncs IMAP state on a fixed delay
- Calls `assistant-api`
- Receives `thinking` and `response` callbacks for Email threads
- Sends SMTP replies with preserved threading headers
- Exposes `GET /status`
- Exposes `GET /metrics`
- Exposes `GET /openapi.json`

### `gateway-web`

- Serves a simple Web chat page
- Accepts WebSocket messages from the browser
- Calls `assistant-api`
- Receives callback messages for the Web chat
- Sends assistant replies back through WebSocket
- Exposes `GET /status`
- Exposes `GET /metrics`

### `assistant-scheduler`

- Runs cron-based jobs
- Calls `assistant-api`
- Stops after the job is accepted for queueing
- Exposes `GET /status`
- Exposes `GET /metrics`

### `swagger`

- Reads OpenAPI from `assistant-api`
- Reads OpenAPI from `assistant-orchestrator`
- Reads OpenAPI from `assistant-llm`
- Reads OpenAPI from `assistant-memory`
- Reads OpenAPI from `gateway-web`
- Reads OpenAPI from `gateway-telegram`
- Reads OpenAPI from `gateway-email`
- Shows the available schemas in one UI

### `prometheus`

- Scrapes metrics from runtime services
- Stores time-series data
- Exposes query endpoints for dashboards and alerts

### `assistant-llm`

- Owns LLM provider and model settings
- Exposes provider status and model catalog
- Executes main, summarize, and extract-memory generations
- Provides unified messages-based provider adapter layer
- Exposes `GET /status`
- Exposes `GET /metrics`
- Exposes `GET /openapi.json`

## Boundary Rules

- Channel components stay thin.
- `assistant-api` stays thin.
- Assistant business logic lives in `assistant-orchestrator`.
- `assistant-api` and `assistant-orchestrator` communicate through Redis-based jobs and run events.
- `assistant-api` owns all replies to gateways.
- `assistant-scheduler` only triggers work and does not receive assistant replies.
- LLM provider selection must stay behind one worker-facing interface.
- `assistant-orchestrator` must delegate generation calls to `assistant-llm`.
- `assistant-orchestrator` must not call gateway callback endpoints directly.
- `assistant-orchestrator` uses `assistant-memory` for durable memory operations.
