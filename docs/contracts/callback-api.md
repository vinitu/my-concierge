# Contract: Callback API

## Purpose

Describe what `assistant-worker` sends to callback targets.

## Flow

1. A gateway or scheduler sends a message to `assistant-api`.
2. `assistant-api` accepts the request and enqueues it.
3. `assistant-worker` processes the queued message asynchronously.
4. While the LLM request is running, `assistant-worker` may send periodic `thinking` callbacks.
5. When the LLM request finishes, `assistant-worker` sends the final assistant reply to the `response` callback endpoint.
6. The callback target returns a delivery response.

## Rules

- Callback delivery happens after queue processing starts.
- In the current V1 flow, one accepted request produces one final callback message.
- `thinking` callbacks are transient and may happen every `N` seconds while the LLM request is in progress.
- `response` callbacks contain the final assistant message.
- For `gateway-web`, callback targets are `POST /thinking/<conversation_id>` and `POST /response/<conversation_id>`.
- For `gateway-web`, `<conversation_id>` is the stable browser `session_id` stored in the `myconcierge_session_id` cookie.
- `gateway-web` should forward `thinking` callbacks to the browser through WebSocket without persisting them.
- `gateway-web` should forward final `response` callbacks to the browser through WebSocket.
- `gateway-web` should also persist final `response` callbacks in `runtime/gateway-web/conversations/{session_id}.json`.
- `gateway-telegram` and `gateway-email` should deliver callback messages through their own channels.

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

```json
{
  "message": "I received your message: Turn on the kitchen lights"
}
```

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
  "response": "Response callback delivered"
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
- While the worker is waiting on the LLM, it may send periodic `thinking` callbacks.
- The final assistant answer is delivered asynchronously by `assistant-worker` through the `response` callback endpoint.
- The callback endpoint should be idempotent enough to tolerate retries.

## Current `gateway-web` Mapping

For the browser flow:

- `gateway-web` creates or reads a stable `session_id` from the `myconcierge_session_id` cookie
- the browser WebSocket authenticates with that `session_id`
- `gateway-web` sends the same `session_id` as both `contact` and `conversation_id` to `assistant-api`
- `gateway-web` sends its own base URL as `host`
- `assistant-worker` calls back to `POST /thinking/{session_id}` while the LLM request is running
- `assistant-worker` calls back to `POST /response/{session_id}` when the final reply is ready
- `gateway-web` stores the final assistant reply in `runtime/gateway-web/conversations/{session_id}.json`
- `gateway-web` forwards both thinking and final response events to the active WebSocket session with the same `session_id`
