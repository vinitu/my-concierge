# Contract: Callback API

## Purpose

Describe what `assistant-worker` sends to callback targets.

## Rules

- Callback delivery happens after queue processing.
- One accepted request may produce zero, one, or many callback messages.
- Each callback request contains one assistant message.
- For `gateway-web`, the callback target should be `POST /callbacks/assistant/<contact>`.
- `gateway-web` should forward callback messages to the browser through WebSocket.
- `gateway-telegram` and `gateway-email` should deliver callback messages through their own channels.

## Example

```json
{
  "message": "I received your message: Turn on the kitchen lights"
}
```
