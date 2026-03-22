# Operations: Metrics

## Goal

Describe how metrics are exposed and which metrics each implemented service provides.

## Flow

All implemented runtime services expose Prometheus-compatible metrics through `GET /metrics`.
The current metrics flow is service-local: each service produces and serves its own metric set, and an external scraper can collect them independently.

```mermaid
flowchart LR
    Prom["Metrics scraper"] --> GW["gateway-web /metrics"]
    Prom --> API["assistant-api /metrics"]
    Prom --> Worker["assistant-worker /metrics"]

    GW --> GWReg["gateway-web metric registry"]
    API --> APIReg["assistant-api metric registry"]
    Worker --> WorkerReg["assistant-worker metric registry"]
```

## `gateway-web`

| Metric | Type | Labels | Description |
|---------|---------|---------|-------------|
| `http_request_time_ms` | `histogram` | `route`, `service`, `response_code` | HTTP request duration in milliseconds |
| `websocket_active_sessions` | `gauge` | `service` | Current number of active WebSocket sessions |
| `incoming_messages_total` | `counter` | `service`, `transport` | Total number of incoming messages |
| `callback_deliveries_total` | `counter` | `delivered`, `service` | Total number of callback deliveries |
| `upstream_requests_total` | `counter` | `service`, `status`, `upstream` | Total number of upstream HTTP requests |
| `endpoint_requests_total` | `counter` | `endpoint`, `service` | Total number of endpoint requests |

## `assistant-api`

| Metric | Type | Labels | Description |
|---------|---------|---------|-------------|
| `http_request_time_ms` | `histogram` | `route`, `service`, `response_code` | HTTP request duration in milliseconds |
| `accepted_messages_total` | `counter` | `service` | Total number of accepted conversation requests |
| `queue_messages` | `gauge` | `service` | Current number of messages in the queue |
| `endpoint_requests_total` | `counter` | `endpoint`, `service` | Total number of endpoint requests |

## `assistant-worker`

| Metric | Type | Labels | Description |
|---------|---------|---------|-------------|
| `http_request_time_ms` | `histogram` | `route`, `service`, `response_code` | HTTP request duration in milliseconds |
| `processed_jobs_total` | `counter` | `service` | Total number of processed queue jobs |
| `callback_requests_total` | `counter` | `service`, `status` | Total number of callback requests |
| `queue_messages` | `gauge` | `service` | Current number of queue files visible to `assistant-worker` |
| `endpoint_requests_total` | `counter` | `endpoint`, `service` | Total number of endpoint requests |
