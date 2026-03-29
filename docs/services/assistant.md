# Service: assistant

## Purpose

`assistant` is the core backend component.
It consists of `assistant-api`, `queue`, `assistant-orchestrator`, `assistant-llm`, and `assistant-memory`.

## Responsibilities

- Accept inbound requests from channel gateways and `assistant-scheduler`
- Validate and enqueue accepted work through `assistant-api`
- Buffer work between intake and processing through `queue`
- Process queued jobs through `assistant-orchestrator`
- Execute LLM generations through `assistant-llm`
- Store and retrieve durable memory through `assistant-memory`
- Deliver callbacks through `assistant-api`

## Relations

```mermaid
flowchart LR
    GW["gateways"] <--> API["assistant-api"]
    Scheduler["assistant-scheduler"] --> API
    API --> Q["queue"]
    Q --> Worker["assistant-orchestrator"]
    Q --> API
    Worker --> LLM["assistant-llm"]
    Worker --> Memory["assistant-memory"]
    Memory --> LLM
```

## Internal Components

- `assistant-api`
- `queue`
- `assistant-orchestrator`
- `assistant-llm`
- `assistant-memory`

## Direction Rules

- `assistant-api` accepts requests, writes jobs to `queue`, consumes run events from `queue`, and sends replies to gateways.
- `assistant-scheduler` only triggers new work and does not receive replies from `assistant`.
- `assistant-orchestrator` processes jobs and publishes run events.
- `assistant-llm` owns provider/model settings and generation endpoints.
- `assistant-memory` owns durable memory retrieval and writes.

## Endpoints

- `assistant` itself does not expose a separate HTTP surface.
- Use the documents for `assistant-api`, `assistant-orchestrator`, `assistant-llm`, and `assistant-memory` for concrete endpoints.

## Metrics

- `assistant` itself does not expose a separate Prometheus registry.
- Metrics are exposed separately by `assistant-api`, `assistant-orchestrator`, `assistant-llm`, and `assistant-memory`.

## Related Documents

- [assistant-api](./assistant/assistant-api.md)
- [assistant-memory](./assistant/assistant-memory.md)
- [assistant-orchestrator](./assistant/assistant-orchestrator.md)
- [assistant-llm](./assistant/assistant-llm.md)
- [gateways](./gateways.md)
- [queue](./queue.md)
