# Task: MyConcierge High-Level Requirements

## Requirements (specify)
### Goal
Build a personal home assistant for one user.
The system should stay small, cheap to run, and easy to extend.

### Context
MyConcierge is a lightweight NestJS system.
It replaces heavier assistant systems with a simpler runtime and clear component boundaries.

### Scope (list)
- In: one local runtime named `assistant`
- In: split runtime parts `assistant-api` and `assistant-worker`
- In: Redis transport between `assistant-api` and `assistant-worker` in both directions
- In: one `assistant-memory` service for durable memory
- In: communication through Telegram, Email, a simple Web chat, and Scheduler
- In: MySQL for conversation state and durable memory storage
- In: Prometheus metrics
- In: OpenAPI schemas and one shared Swagger UI
- In: Docker, Docker Compose, and Kubernetes
- Out: multi-user support
- Out: authentication and authorization for the first version
- Out: heavy infrastructure that is not needed for one user

### Must-haves
- The system must use Node.js, TypeScript, and NestJS.
- The local runtime must be named `assistant`.
- `assistant` must be split into `assistant-api` and `assistant-worker`.
- `assistant-api` and `assistant-worker` must communicate through Redis-based jobs and run events.
- `assistant-api` must validate requests, enqueue jobs, consume run events, and own all external callbacks.
- `assistant-worker` must run assistant business logic.
- `assistant-memory` must own durable memory retrieval and writes.
- The system must support Grok in the first version.
- Later versions must support DeepSeek, OpenAI, and Ollama through the same integration model.
- `assistant-worker` must call LLMs through one shared provider interface.
- `assistant-worker` must use LangChain.js.
- The system must support Telegram, Email, and Web gateway components.
- `gateway-web` must provide a simple chat page and WebSocket transport for browser messages.
- Gateway rollout order is `gateway-web`, then `gateway-email`, then `gateway-telegram`.
- The system must support a Scheduler component.
- All runtime components must expose `GET /status` and `GET /metrics`.
- `assistant-api`, `assistant-worker`, `assistant-memory`, `gateway-web`, `gateway-telegram`, and `gateway-email` must expose their own `GET /openapi.json`.
- One shared Swagger UI must be able to show the available OpenAPI schemas.
- `GET /metrics` for `assistant-api` must include queue depth.
- Docker Compose must be the default way to run the project.
- The same runtime model must work in Docker and Kubernetes.

### Quality requirements
- The design should stay small and easy to understand.
- The number of runtime services should stay low.
- `assistant-api` should stay thin.
- Queue and callback rules should stay consistent across channels.
- External callbacks should be owned by `assistant-api`.
- The Web chat should stay simple and low-resource.
- OpenAPI, status, and metrics endpoints should stay consistent across services.
- App services should use the same internal port in container environments.
- The system should be easy to scale horizontally.
- The system should use low CPU and memory when idle.

### Limits / dependencies / assumptions
- The system is for one personal user.
- The first version is backend-first.
- Docker Compose is the default deployment mode.
- Redis transport is required between API intake and worker execution.
- Redis is the canonical queue transport.
- One shared Swagger UI is preferred over multiple Swagger UI services.
- `assistant-worker` reads `SYSTEM.js`, `SOUL.js`, `IDENTITY.js`, and `skills/` from `runtime/assistant-worker/`.
- conversation state lives in MySQL under `assistant-worker` ownership.
- durable memory lives behind `assistant-memory`.
- `gateway-web` stores browser chat history in `runtime/gateway-web/conversations/`.

### Done checks
- The documentation is split into overview, architecture, services, contracts, deployment, and operations.
- The requirements state that `assistant` is split into `assistant-api` and `assistant-worker`.
- The requirements state that `assistant-api` owns ingress and external callback delivery.
- The requirements state that `assistant-worker` runs business logic.
- The requirements state that `assistant-memory` owns durable memory.
- The requirements state that all runtime components expose `GET /status` and `GET /metrics`.
- The requirements state that `assistant-api`, `assistant-worker`, `assistant-memory`, `gateway-web`, `gateway-telegram`, and `gateway-email` each expose `GET /openapi.json`.
- The requirements state that one shared Swagger UI may show the available schemas.
- The requirements state that Docker Compose is the default runtime.

### Risks
- Weak queue contracts may cause lost or duplicated jobs.
- Weak component boundaries may move business logic into `assistant-api`.
- Different LLM providers may need different prompts, limits, and response parsing.
- Weak callback ownership may create duplicate or lost deliveries.
- Poor metrics design may create too many time series.
- Too many runtime services may break the minimal design goal.

### Open questions
- Which worker jobs need scaling first?
- Which Prometheus metrics are required in the first MVP?
