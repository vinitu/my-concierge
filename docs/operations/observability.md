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
- `assistant-orchestrator` exposes `GET /openapi.json`
- `assistant-memory` exposes `GET /openapi.json`
- `dashboard` exposes `GET /openapi.json`
- `gateway-web` exposes `GET /openapi.json`
- `gateway-telegram` exposes `GET /openapi.json`
- `gateway-email` exposes `GET /openapi.json`
- One shared Swagger UI shows the available service schemas
