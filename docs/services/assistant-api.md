# Service: assistant-api

## Purpose

`assistant-api` is the public intake service inside `assistant`.

## Responsibilities

- Accept inbound conversation requests
- Validate request path and body
- Write accepted work to the queue
- Select the queue adapter from environment variables
- Return immediate acceptance responses
- Expose operational endpoints

## Relations

```mermaid
flowchart LR
    GW["gateways"] --> API["assistant-api"]
    Scheduler["scheduler"] --> API
    API --> Q["queue"]
```

## Endpoints

| Endpoint | Purpose |
|---------|---------|
| `GET /` | Service entrypoint summary |
| `POST /conversation/{direction}/{chat}/{contact}` | Accept a conversation event |
| `GET /status` | Service readiness |
| `GET /metrics` | Prometheus metrics |
| `GET /openapi.json` | OpenAPI schema |

## Request Contract

The request body includes:

- `message`
- `host`
- `conversation_id`

`assistant-api` validates those fields and writes them to the queue without building callback URLs itself.

## Must Not Do

- Run assistant business logic
- Call LLM providers for conversation processing
- Send callback messages
- Send replies back to gateways

## Queue Adapter

- `assistant-api` should choose its queue adapter through env
- `QUEUE_ADAPTER=redis` means Redis queue storage
- `REDIS_URL` defines the Redis connection string
- `REDIS_QUEUE_NAME` defines the Redis list name
- Redis is the current default adapter
- `QUEUE_ADAPTER=file` remains available as a fallback

## Metrics

| Metric | Type | Labels | Description |
|---------|---------|---------|-------------|
| `http_request_time_ms` | `histogram` | `route`, `service`, `response_code` | HTTP request duration in milliseconds |
| `accepted_messages_total` | `counter` | `service` | Total number of accepted conversation requests |
| `queue_messages` | `gauge` | `service` | Current number of messages in the queue |
| `endpoint_requests_total` | `counter` | `endpoint`, `service` | Total number of endpoint requests |
