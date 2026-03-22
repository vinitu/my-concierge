# Contract: Status And Metrics

## Purpose

Describe shared rules for `GET /status` and `GET /metrics`.

## Status Rules

- All runtime components expose `GET /status`.
- `GET /status` must be simple and fast.
- `GET /status` should report readiness.

## Metrics Rules

- All runtime components expose `GET /metrics`.
- `GET /metrics` returns Prometheus-compatible output.
- `assistant-api` metrics must include queue depth.
- Worker and gateway metrics should stay simple.

## Example Status Response

```json
{
  "status": "ok",
  "ready": true
}
```
