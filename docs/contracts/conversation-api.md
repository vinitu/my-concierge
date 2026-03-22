# Contract: Conversation API

## Endpoint

`POST /conversation/<direction>/<chat>/<contact>`

## Purpose

Accept a conversation event and place it into the queue.

## Request Body

```json
{
  "message": "Turn on the kitchen lights",
  "callback_url": "https://client.example.com/callbacks/assistant"
}
```

## Rules

- `assistant-api` validates the request.
- `assistant-api` writes the request to the queue.
- `assistant-api` may choose the queue implementation through env.
- Redis is the current default queue implementation.
- The immediate HTTP response is only an acceptance response.
- The final assistant reply does not come in the immediate response.

## Response Example

```json
{
  "response": "Message accepted"
}
```
