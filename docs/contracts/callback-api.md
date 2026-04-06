# Contract: Callback API

## Purpose

Describe what `assistant-api` sends to callback targets after consuming run events from Redis.

## Flow

1. A gateway or `assistant-scheduler` sends a message to `assistant-api`.
2. `assistant-api` accepts the request and enqueues it.
3. `assistant-orchestrator` processes the queued message asynchronously.
4. While the worker run is active, `assistant-orchestrator` may publish periodic `thinking` run events.
5. When the run finishes, `assistant-orchestrator` publishes the final run event to Redis.
6. `assistant-api` consumes those run events and sends the corresponding callback request to the gateway callback endpoint.
7. The callback target returns a delivery response.

## Rules

- Callback delivery happens after queue processing starts.
- One accepted request produces one final callback message.
- `thinking` callbacks are transient and may happen every `N` seconds while the worker run is in progress.
- `response` callbacks contain the final assistant message.
- For `gateway-web`, callback targets are `POST /thinking/<conversation_id>`, `POST /tool/<conversation_id>`, and `POST /response/<conversation_id>`.
- For `gateway-web`, event callbacks are sent to `POST /event/<conversation_id>`.
- For `gateway-web`, `<conversation_id>` is the stable browser `conversation_id` stored in the `myconcierge_conversation_id` cookie.
- `gateway-web` should forward `thinking` callbacks to the browser through WebSocket without persisting them.
- `gateway-web` should forward `tool` callbacks to the browser through the same WebSocket event stream used for other assistant events.
- `gateway-web` should forward final `response` callbacks to the browser through WebSocket.
- `gateway-web` should not persist final callbacks locally; canonical conversation state is stored by `assistant-orchestrator` in `assistant-memory`.
- `gateway-email` callback targets are `POST /thinking/<conversation_id>` and `POST /response/<conversation_id>`.
- `gateway-email` should resolve the local mailbox thread by `conversation_id`, preserve `In-Reply-To` and `References`, and send the final `response` callback as an SMTP reply.
- `gateway-telegram` callback targets are `POST /thinking/<conversation_id>` and `POST /response/<conversation_id>`.
- `gateway-telegram` should resolve the local Telegram thread by `conversation_id` and send the final `response` callback through the Telegram Bot API using `reply_to_message_id` and `message_thread_id` when available.
- `assistant-api` retries callback delivery when the gateway returns a non-2xx response or times out.
- callback delivery is idempotent by `runId + eventType + sequence`.

## Thinking Callback Request

### Endpoint

`POST /thinking/<conversation_id>`

### Body

| Field | Type | Required | Description |
|---------|---------|---------|-------------|
| `seconds` | `integer` | yes | Number of seconds the gateway should show the transient thinking state |

```json
{
  "seconds": 2
}
```

## Response Callback Request

### Endpoint

`POST /response/<conversation_id>`

### Body

| Field | Type | Required | Description |
|---------|---------|---------|-------------|
| `message` | `string` | yes | Final assistant reply text |
| `request_id` | `string` | yes | Canonical run request id |
| `sequence` | `integer` | yes | Canonical run-event sequence |

```json
{
  "message": "I received your message: Turn on the kitchen lights",
  "request_id": "req_123",
  "sequence": 3
}
```

## Tool Callback Request

### Endpoint

`POST /tool/<conversation_id>`

### Body

| Field | Type | Required | Description |
|---------|---------|---------|-------------|
| `tool_name` | `string` | yes | Canonical assistant tool name |
| `ok` | `boolean` | yes | Whether the tool execution succeeded |
| `message` | `string` | yes | Human-readable summary of the tool execution |
| `request_id` | `string` | yes | Canonical run request id |
| `sequence` | `integer` | yes | Canonical run-event sequence |
| `payload` | `object` | no | Raw tool observation payload |

```json
{
  "tool_name": "time_current",
  "ok": true,
  "message": "Tool time_current completed successfully",
  "request_id": "req_123",
  "sequence": 2,
  "payload": {
    "iso": "2026-04-06T18:00:00.000Z",
    "timezone": "Europe/Warsaw"
  }
}
```

## Event Callback Request

### Endpoint

`POST /event/<conversation_id>`

### Body

| Field | Type | Required | Description |
|---------|---------|---------|-------------|
| `type` | `string` | yes | Event type (`run.*` or `memory.*`) |
| `message` | `string` | yes | Human-readable event message |
| `request_id` | `string` | no | Canonical run request id when the event came from one run |
| `sequence` | `integer` | no | Canonical run-event sequence when the event came from one run |

Example:

```json
{
  "type": "memory.profile.updated",
  "message": "Updated profile in memory",
  "request_id": "req_123",
  "sequence": 4
}
```

Typical memory event types:
- `memory.fact.added`
- `memory.fact.updated`
- `memory.fact.deleted`
- `memory.fact.readed`
- `memory.fact.failed`
- `memory.profile.updated`
- `memory.profile.failed`

## Callback Response

### Generic Client Standard

Clients should return `200 OK` when the callback was accepted for delivery.

Recommended response body:

```json
{
  "delivered": true,
  "response": "Callback accepted"
}
```

### Current `gateway-web` Response

The implemented `gateway-web` callback endpoints currently return:

```json
{
  "delivered": true,
  "response": "Callback delivered"
}
```

If the browser session is not found, it returns:

```json
{
  "delivered": false,
  "response": "WebSocket session not found"
}
```

## Client Standard

- The caller sends one message per request to `assistant-api`.
- The caller receives an immediate acceptance response from `assistant-api`.
- While the worker run is active, `assistant-api` may send periodic `thinking` callbacks after consuming worker run events.
- The final assistant answer is delivered asynchronously by `assistant-api` through the `response` callback endpoint.
- The callback endpoint should be idempotent enough to tolerate retries.

## Retry Policy

- `assistant-api` owns callback retries
- gateways must treat duplicate callback deliveries as safe retries
- retries must preserve the same callback payload
- terminal callback retries must not create duplicate user-visible state when the gateway already processed the event

## Current `gateway-web` Mapping

For the browser flow:

- `gateway-web` creates or reads a stable `conversation_id` from the `myconcierge_conversation_id` cookie
- the browser WebSocket authenticates with that `conversation_id`
- `gateway-web` sends configured `user_id` as `contact` and cookie-backed `conversation_id` to `assistant-api`
- `assistant-api` stores the callback routing metadata for that session
- `assistant-orchestrator` publishes `thinking`, `tool`, and `completed` run events to Redis
- `assistant-api` calls back to `POST /thinking/{conversation_id}` while the worker run is active
- `assistant-api` calls back to `POST /tool/{conversation_id}` after each tool execution
- `assistant-api` calls back to `POST /response/{conversation_id}` when the final reply is ready
- `gateway-web` forwards thinking, tool, and final response events to the active WebSocket session for that `conversation_id`

## `gateway-email` Mapping

For the email flow:

- `gateway-email` resolves one stable `conversation_id` per email chain from `Message-ID`, `In-Reply-To`, and `References`
- `gateway-email` stores inbound and outbound message copies in its local mailbox runtime
- `gateway-email` sends the same stable `conversation_id` to `assistant-api`
- `assistant-api` stores callback routing metadata for that email thread
- `assistant-orchestrator` publishes `thinking` and `completed` run events to Redis
- `assistant-api` calls back to `POST /thinking/{conversation_id}` while the worker run is active
- `assistant-api` calls back to `POST /response/{conversation_id}` when the final reply is ready
- `gateway-email` resolves the thread from its local runtime and sends an SMTP reply with preserved `In-Reply-To` and `References`
- `gateway-email` stores the outbound reply in its local mailbox runtime

## `gateway-telegram` Mapping

For the Telegram flow:

- `gateway-telegram` resolves one stable `conversation_id` per Telegram chat or topic
- `gateway-telegram` stores inbound and outbound message copies in its local chat runtime
- `gateway-telegram` sends the same stable `conversation_id` to `assistant-api`
- `assistant-api` stores callback routing metadata for that Telegram thread
- `assistant-orchestrator` publishes `thinking` and `completed` run events to Redis
- `assistant-api` calls back to `POST /thinking/{conversation_id}` while the worker run is active
- `assistant-api` calls back to `POST /response/{conversation_id}` when the final reply is ready
- `gateway-telegram` resolves the thread from its local runtime and sends a Telegram Bot API reply using `reply_to_message_id` and `message_thread_id` when available
- `gateway-telegram` stores the outbound reply in its local chat runtime
