# MyConcierge Documentation

## Goal

This documentation explains the system in small and clear parts.
It separates product rules, architecture rules, service rules, API contracts, deployment, and operations.

## Read Order

1. `requirements.md`
2. `architecture/runtime.md`
3. `architecture/components.md`
4. `architecture/data-flow.md`
5. `architecture/conversation.md`
6. `architecture/queue-flow.md`
7. `architecture/callback-flow.md`
8. `architecture/memory.md`
9. `architecture/persistence-schema.md`
10. `architecture/repository-layout.md`
11. `services/*`
11. `contracts/*`
12. `deployment/*`
13. `operations/*`

## Main Ideas

- The local runtime is named `assistant`.
- `assistant` is centered on `assistant-api`, `assistant-worker`, and `assistant-memory`.
- `assistant-api` accepts inbound requests, writes jobs to Redis, consumes run events from Redis, and owns all external callbacks.
- `assistant-worker` consumes execution jobs from Redis, runs the LangChain.js-based assistant loop, and publishes run events back to Redis.
- `assistant-memory` is the durable memory service for retrieval, writes, profile state, and memory maintenance.
- MySQL is the canonical store for conversation state and durable memory data.
- Redis is the transport layer between `assistant-api` and `assistant-worker` in both directions.
- `dashboard`, `gateway-web`, `gateway-telegram`, `gateway-email`, `assistant-api`, `assistant-worker`, and `assistant-memory` are implemented in this repository.
- All runtime components expose `GET /status` and `GET /metrics`.
- `assistant-api`, `assistant-worker`, `assistant-memory`, `dashboard`, `gateway-web`, `gateway-telegram`, and `gateway-email` expose `GET /openapi.json`.
- One shared Swagger UI may show multiple OpenAPI schemas.
- Docker Compose is the default runtime.

## Main Sections

- `requirements.md`: high-level system requirements
- `architecture/`: runtime model and component boundaries
- `architecture/conversation.md`: canonical conversation ownership, thread identity, and write path
- `architecture/queue-flow.md`: Redis jobs and run events
- `architecture/callback-flow.md`: callback ownership and gateway delivery
- `architecture/memory.md`: durable memory ownership, read path, and write path
- `architecture/persistence-schema.md`: canonical MySQL tables for conversations and memory
- `architecture/repository-layout.md`: repository structure
- `services/`: service-by-service behavior
- `contracts/`: exact API and queue contracts
- `deployment/`: how to run the system
- `operations/`: observability and scaling rules
