# Data Flow

## Main Flow

```text
gateway -> assistant-api -> redis -> assistant-orchestrator -> redis -> assistant-api -> gateway
```

## Conversation Flow

1. A gateway sends a request to `assistant-api`.
2. `assistant-api` validates the request.
3. `assistant-api` writes an execution job to Redis.
4. `assistant-api` returns an acceptance response.
5. `assistant-orchestrator` reads the execution job from Redis.
6. `assistant-orchestrator` runs assistant logic.
7. `assistant-orchestrator` persists conversation state and calls `assistant-memory` when durable memory is needed.
8. `assistant-orchestrator` publishes `thinking`, `completed`, or `failed` run events to Redis.
9. `assistant-api` consumes those run events from Redis.
10. `assistant-api` delivers the corresponding callback to the originating gateway.

## Web Chat Flow

```text
browser -> gateway-web GET /
browser -> gateway-web WS /ws
gateway-web -> assistant-api -> redis -> assistant-orchestrator
assistant-orchestrator -> redis -> assistant-api
assistant-api -> gateway-web POST /thinking/<conversation_id>
assistant-api -> gateway-web POST /response/<conversation_id>
gateway-web -> browser WS /ws
```

1. The browser opens `gateway-web`.
2. `gateway-web` returns the chat page.
3. The browser opens a WebSocket connection to `gateway-web`.
4. The browser sends chat messages through WebSocket.
5. `gateway-web` sends the message to `assistant-api`.
6. `assistant-api` validates the request and writes an execution job to Redis.
7. `assistant-orchestrator` reads the queued job.
8. `assistant-orchestrator` may publish `thinking` run events while runtime generation is active.
9. `assistant-api` consumes those run events and calls the `gateway-web` callback endpoints.
10. `gateway-web` forwards each thinking callback to the browser through WebSocket for the requested duration.
11. `assistant-api` sends the final `response` callback to `gateway-web`.
12. `gateway-web` forwards the final response to the browser through WebSocket.

## Observability Flow

```text
prometheus -> /metrics
```

- Each runtime component exposes `GET /metrics`.
- `assistant-api` exposes queue depth.

## Documentation Flow

```text
swagger -> assistant-api /openapi.json
swagger -> assistant-orchestrator /openapi.json
swagger -> assistant-memory /openapi.json
swagger -> dashboard /openapi.json
swagger -> gateway-web /openapi.json
swagger -> gateway-telegram /openapi.json
swagger -> gateway-email /openapi.json
```
