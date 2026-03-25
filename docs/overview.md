# MyConcierge Documentation

## Goal

This documentation explains the system in small and clear parts.
It separates product rules, architecture rules, service rules, API contracts, deployment, and operations.

## Read Order

1. `requirements.md`
2. `architecture/runtime.md`
3. `architecture/components.md`
4. `architecture/data-flow.md`
5. `architecture/agent-runtime-redesign.md`
6. `architecture/repository-layout.md`
7. `services/*`
8. `contracts/*`
9. `deployment/*`
10. `operations/*`

## Main Ideas

- The local runtime is named `assistant`.
- `assistant` is split into `assistant-api` and `assistant-worker`.
- `assistant-api` only validates requests, writes to the queue, and returns acceptance responses.
- `assistant-api` already exists in the codebase.
- `assistant-worker` reads the queue, loads runtime context from `./runtime/assistant-worker`, calls an LLM provider through a shared provider interface, and sends callbacks.
- `architecture/agent-runtime-redesign.md` describes the proposed next-step split between `assistant-agent`, `assistant-memory`, and specialized execution services.
- V1 supports `xai` and `ollama` providers.
- Redis is the current default queue transport between `assistant-api` and `assistant-worker`.
- `gateway-web` is the first implemented service in this repository.
- All runtime components expose `GET /status` and `GET /metrics`.
- `assistant-api` and `assistant-worker` expose their own `GET /openapi.json`.
- One shared Swagger UI may show both OpenAPI schemas.
- Docker Compose is the default runtime.

## Main Sections

- `requirements.md`: high-level system requirements
- `architecture/`: runtime model and component boundaries
- `architecture/agent-runtime-redesign.md`: proposed redesign for `assistant-agent`, `assistant-memory`, and execution services
- `architecture/repository-layout.md`: target repository structure
- `services/`: service-by-service behavior
- `contracts/`: exact API and queue contracts
- `deployment/`: how to run the system
- `operations/`: observability and scaling rules
