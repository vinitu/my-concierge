# Service: assistant-worker

## Purpose

`assistant-worker` is the queued execution service inside `assistant`.

## Responsibilities

- Read jobs from the queue
- Read jobs from Redis queue in the current implementation
- Build a simple reply from the accepted message
- Send callback messages
- Expose operational endpoints

## Relations

```mermaid
flowchart LR
    Q["queue"] --> Worker["assistant-worker"]
    Worker --> GW["originating gateway callback endpoint"]
```

## Endpoints

| Endpoint | Purpose |
|---------|---------|
| `GET /` | Service entrypoint summary |
| `GET /status` | Worker readiness |
| `GET /metrics` | Prometheus metrics |
| `GET /openapi.json` | OpenAPI schema |

## Rules

- The worker does not accept public conversation requests.
- The worker reads work only from the queue.
- One queued job may produce zero, one, or many callback messages.
- The current worker logic is simple: it sends back that the message was received.
- The current worker reads Redis queue messages created by `assistant-api`.

## Metrics

| Metric | Type | Labels | Description |
|---------|---------|---------|-------------|
| `http_request_time_ms` | `histogram` | `route`, `service`, `response_code` | HTTP request duration in milliseconds |
| `processed_jobs_total` | `counter` | `service` | Total number of processed queue jobs |
| `callback_requests_total` | `counter` | `service`, `status` | Total number of callback requests |
| `queue_messages` | `gauge` | `service` | Current number of queue files visible to `assistant-worker` |
| `endpoint_requests_total` | `counter` | `endpoint`, `service` | Total number of endpoint requests |
