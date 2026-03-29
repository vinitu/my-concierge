# MyConcierge

Personal home assistant platform built with NestJS.

## Project mode

This is a **new project baseline**.

- Backward compatibility is **not required**
- Breaking changes are allowed by default
- Legacy components, legacy endpoints, and legacy configs should be removed, not supported
- Do not add compatibility aliases, shims, or dual paths unless explicitly requested

## Tech stack

- **Runtime**: Node.js + TypeScript (strict mode)
- **Framework**: NestJS
- **Package manager**: npm
- **Testing**: Jest (unit), Supertest (e2e)

## Commands

| Command | Description |
|---------|-------------|
| `npm run start` | Start in development mode |
| `npm run start:dev` | Start with hot reload (watch mode) |
| `npm run start:prod` | Start production build |
| `npm run build` | Build the project |
| `npm run test` | Run unit tests |
| `npm run test:e2e` | Run e2e tests |
| `npm run test:all` | Run unit and e2e tests |
| `npm run lint` | Lint the code |
| `npm run format` | Format with Prettier |

## Development guidelines

- Write tests for every new feature and behavior change
- After code changes, run relevant tests before finishing
- Prefer deleting obsolete code over preserving compatibility
- Use strict TypeScript, avoid `any`
- Keep controllers thin, move business logic to services
- Keep configs in env vars and runtime config files only where needed
- If architecture changes, update docs in the same change

## Canonical architecture

Current canonical assistant services:

- `assistant-api` — ingress and request acceptance
- `assistant-orchestrator` — run orchestration, tools, callbacks
- `assistant-llm` — provider/model config and LLM execution
- `assistant-memory` — conversations + durable memory storage/enrichment
- `gateway-web` — chat UI and callback display

Rules:

- `assistant-orchestrator` must call `assistant-llm` for LLM operations
- LLM provider/model settings must live only in `assistant-llm`
- Conversation API should use canonical identifiers (`direction`, `user_id`, `conversation_id`, `request_id`, `accepted_at`)
- Memory enrichment is async and should be driven by conversation updates
- Prefer explicit, typed endpoints over generic multi-purpose endpoints
- Prometheus metrics and `/status` endpoints are required for services

## Migration policy

- Hard cutovers are preferred
- When replacing old behavior, remove old code paths in the same PR
- If migration is needed, keep it minimal and time-boxed, then delete migration-only code
