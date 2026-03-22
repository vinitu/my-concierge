# Contract: OpenAPI

## Purpose

Describe where OpenAPI schemas come from.

## Endpoints

- `assistant-api -> GET /openapi.json`
- `assistant-worker -> GET /openapi.json`
- `gateway-web -> GET /openapi.json`

## Swagger Rule

- One shared Swagger UI reads both schemas.
- The UI should let the user switch between them.
- Each service keeps its own independent schema.
