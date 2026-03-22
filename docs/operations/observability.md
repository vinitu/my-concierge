# Operations: Observability

## Goal

Describe status, metrics, and documentation endpoints.

## Status

- All runtime components expose `GET /status`

## Metrics

- All runtime components expose `GET /metrics`
- `assistant-api` exposes queue depth
- Prometheus reads metrics from the services

## OpenAPI

- `assistant-api` exposes `GET /openapi.json`
- `assistant-worker` exposes `GET /openapi.json`
- One shared Swagger UI shows both schemas
