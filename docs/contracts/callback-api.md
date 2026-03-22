# Contract: Callback API

## Purpose

Describe what `assistant-worker` sends to callback targets.

## Flow

1. A gateway or scheduler sends a message to `assistant-api`.
2. `assistant-api` accepts the request and enqueues it.
3. `assistant-worker` processes the queued message asynchronously.
4. `assistant-worker` sends the assistant reply to the provided callback URL.
5. The callback target returns a delivery response.

## Rules

- Callback delivery happens after queue processing.
- One accepted request may produce zero, one, or many callback messages.
- Each callback request contains one assistant message.
- For `gateway-web`, the callback target should be `POST /callbacks/assistant/<contact>`.
- `gateway-web` should forward callback messages to the browser through WebSocket.
- `gateway-telegram` and `gateway-email` should deliver callback messages through their own channels.

## Callback Request

### Body

| Field | Type | Required | Description |
|---------|---------|---------|-------------|
| `message` | `string` | yes | Assistant reply text |

Example:

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

The implemented `gateway-web` callback endpoint currently returns:

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
- The final assistant answer is delivered asynchronously by `assistant-worker` through the callback endpoint.
- The callback endpoint should be idempotent enough to tolerate retries.
