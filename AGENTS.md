# MyConcierge

Personal home assistant built with NestJS.

## Project overview

MyConcierge is a lightweight, personalized home assistant designed to replace heavier solutions like OpenClaw. It focuses on solving specific problems with a clean, minimal, low-resource architecture tailored for a single user.

## Tech stack

- **Runtime**: Node.js + TypeScript (strict mode)
- **Framework**: NestJS
- **Package manager**: npm
- **Testing**: Jest (unit), Supertest (e2e)

## Project structure

```
src/
  app.module.ts       — root module
  app.controller.ts   — root controller
  app.service.ts      — root service
  main.ts             — entry point
test/
  app.e2e-spec.ts     — e2e tests
```

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

- All code must be covered by tests
- Write tests for all new features (unit + e2e)
- After any code change, run the relevant tests before finishing the task
- Use strict TypeScript — no `any` types
- Follow NestJS module pattern: each feature gets its own module
- Keep controllers thin, business logic in services
- Use environment variables for configuration (via @nestjs/config)

## Architecture decisions

- Minimalist system — keep dependencies and runtime components small
- Container-first runtime — use Docker Compose by default and also support Docker and Kubernetes
- Main runtime process — use a process named `assistant`
- Runtime startup — `assistant` is a local agent that starts in the working directory and reads `AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `skills/`, and `memory/`
- API-first architecture — keep assistant logic in one server
- Interaction model — external interaction with `assistant` happens through the API
- Telegram, Email, Web, Cron, and Heartbeat components must talk to the server through the API
- Channel architecture must be extensible so new channels can be added as thin adapters
- API, Email, and worker processes must support horizontal scaling
- Scheduled tasks in Kubernetes must use CronJob
- Use one shared LLM integration layer for DeepSeek, xAI, OpenAI, and Ollama
- Keep the LLM layer extensible so new providers can be added later
- Expose Prometheus metrics from the server
- Single-user system — no multi-tenancy or auth needed initially
