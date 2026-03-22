# Service: swagger

## Purpose

Show one shared Swagger UI for the runtime.

## Responsibilities

- Read `assistant-api` OpenAPI schema
- Read `assistant-worker` OpenAPI schema
- Read `gateway-web` OpenAPI schema
- Show the schemas in one UI
- Let the user switch between the schemas

## Relations

```mermaid
flowchart LR
    Swagger["swagger"] --> API["assistant-api /openapi.json"]
    Swagger --> Worker["assistant-worker /openapi.json"]
    Swagger --> Gateway["gateway-web /openapi.json"]
```

## Endpoints

| Endpoint | Purpose |
|---------|---------|
| `GET /` | Shared Swagger UI |

## Source Endpoints

- `http://localhost:3000/openapi.json`
- `http://localhost:3001/openapi.json`
- `http://localhost:8080/openapi.json`

## Metrics

- `swagger` does not expose project-specific Prometheus metrics in this repository.

## Rules

- One shared Swagger UI is preferred over multiple Swagger UI services.
- Swagger UI does not merge schemas. It shows separate schemas in one interface.
