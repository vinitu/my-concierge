# Contract: Conversation API

## Flow

1. The client sends a message to `assistant-api`.
2. `assistant-api` validates the request and enqueues it.
3. `assistant-api` returns an immediate acceptance response.
4. `assistant-worker` reads the queued job later.
5. `assistant-worker` sends periodic thinking callbacks while the LLM request is still running.
6. `assistant-worker` sends the final assistant reply to the gateway host.

## Endpoint

`POST /conversation/<direction>/<chat>/<contact>`

## Purpose

Accept a conversation event and place it into the queue.

## Path Parameters

| Field | Type | Description |
|---------|---------|-------------|
| `direction` | `string` | Request source such as `api`, `telegram`, or `email` |
| `chat` | `string` | Chat type or channel conversation scope |
| `contact` | `string` | Client or conversation identifier |

## Client Request

### Body

| Field | Type | Required | Description |
|---------|---------|---------|-------------|
| `conversation_id` | `string` | yes | Stable gateway-side conversation identifier |
| `host` | `string` | yes | Gateway base URL that will receive callback requests |
| `message` | `string` | yes | User message to process |

```json
{
  "conversation_id": "alex",
  "host": "https://client.example.com",
  "message": "Turn on the kitchen lights"
}
```

## Rules

- `assistant-api` validates the request.
- `assistant-api` writes the request to the queue.
- `assistant-api` may choose the queue implementation through env.
- Redis is the current default queue implementation.
- The immediate HTTP response is only an acceptance response.
- The final assistant reply does not come in the immediate response.

## Acceptance Response

### Success

Status: `202 Accepted`

```json
{
  "status": "accepted"
}
```

### Validation Error

Status: `400 Bad Request`

Examples:

```json
{
  "statusCode": 400,
  "message": "message must not be empty",
  "error": "Bad Request"
}
```

```json
{
  "statusCode": 400,
  "message": "host must not be empty",
  "error": "Bad Request"
}
```

```json
{
  "statusCode": 400,
  "message": "conversation_id must not be empty",
  "error": "Bad Request"
}
```

## Client Expectations

- The client should treat `202 Accepted` as acceptance only, not as the final assistant answer.
- The client should wait for asynchronous callback requests on `host`.
- In the current V1 flow, one accepted request produces one final callback message.
- While the LLM request is running, the worker may also send periodic `thinking` callbacks.

## Current `gateway-web` Contact Rule

For the browser flow:

- `contact` is the stable browser `session_id`
- `gateway-web` stores `session_id` in the `myconcierge_session_id` cookie
- `gateway-web` uses that `session_id` both for the websocket session mapping and for `conversation_id`
- `gateway-web` sends `host` as its own base URL
