# Service: queue

## Purpose

Transport execution jobs from `assistant-api` to `assistant-orchestrator` and run events back from `assistant-orchestrator` to `assistant-api`.

## Responsibilities

- Accept accepted jobs from `assistant-api`
- Keep jobs until a worker reads them
- Accept worker run events
- Keep run events until `assistant-api` reads them
- Support more than one worker instance
- Expose queue depth to metrics

## Relations

```mermaid
flowchart LR
    API["assistant-api"] <--> Q["queue"]
    Q <--> Worker["assistant-orchestrator"]
```

## Endpoints

- No project HTTP endpoints

## Metrics

- `queue` does not expose its own Prometheus endpoint in this repository.
- Queue depth is surfaced through:
  - `queue_messages{service="assistant-api"}`
  - `queue_messages{service="assistant-orchestrator"}`

## Rules

- The queue is the transport layer between `assistant-api` and `assistant-orchestrator` in both directions.
- The queue contract must stay stable across retries and scaling.
- Redis is the queue technology.
