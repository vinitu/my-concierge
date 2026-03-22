# Data Flow

## Main Flow

```text
gateway -> assistant-api -> queue -> assistant-worker -> callback target
```

## Conversation Flow

1. A gateway sends a request to `assistant-api`.
2. `assistant-api` validates the request.
3. `assistant-api` writes the request to Redis queue.
4. `assistant-api` returns an acceptance response.
5. `assistant-worker` reads the queued job from Redis.
6. `assistant-worker` runs assistant logic.
7. `assistant-worker` sends zero, one, or many callback messages.

## Web Chat Flow

```text
browser -> gateway-web GET /
browser -> gateway-web WS /ws
gateway-web -> assistant-api -> queue -> assistant-worker
assistant-worker -> gateway-web POST /callbacks/assistant/<contact>
gateway-web -> browser WS /ws
```

1. The browser opens `gateway-web`.
2. `gateway-web` returns the chat page.
3. The browser opens a WebSocket connection to `gateway-web`.
4. The browser sends chat messages through WebSocket.
5. `gateway-web` sends the message to `assistant-api`.
6. `assistant-api` validates the request and writes it to the queue.
7. `assistant-worker` reads the queued job.
8. `assistant-worker` sends callback messages to `gateway-web`.
9. `gateway-web` forwards each callback message to the browser through WebSocket.

## Observability Flow

```text
prometheus -> /metrics
```

- Each runtime component exposes `GET /metrics`.
- `assistant-api` exposes queue depth.

## Documentation Flow

```text
swagger -> assistant-api /openapi.json
swagger -> assistant-worker /openapi.json
swagger -> gateway-web /openapi.json
```
