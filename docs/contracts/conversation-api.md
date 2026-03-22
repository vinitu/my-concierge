# Contract: Conversation API

## Flow

1. The client sends a message to `assistant-api`.
2. `assistant-api` validates the request and enqueues it.
3. `assistant-api` returns an immediate acceptance response.
4. `assistant-worker` reads the queued job later.
5. `assistant-worker` sends the final assistant reply to the client callback URL.

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
| `message` | `string` | yes | User message to process |
| `callback_url` | `string` | yes | Absolute URL where `assistant-worker` should send the final reply |

```json
{
  "message": "Turn on the kitchen lights",
  "callback_url": "https://client.example.com/callbacks/assistant/alex"
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
  "message": "callback_url must not be empty",
  "error": "Bad Request"
}
```

## Client Expectations

- The client should treat `202 Accepted` as acceptance only, not as the final assistant answer.
- The client should wait for the asynchronous callback on `callback_url`.
- One accepted request may produce zero, one, or many callback messages over time.
