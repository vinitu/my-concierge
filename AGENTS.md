# MyConcierge

Personal home assistant built with NestJS.

## Project overview

MyConcierge is a lightweight, personalized home assistant designed to replace heavier solutions like OpenClaw. It focuses on solving specific problems with a clean architecture tailored for a single user.

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
| `npm run lint` | Lint the code |
| `npm run format` | Format with Prettier |

## Development guidelines

- Write tests for all new features (unit + e2e)
- Use strict TypeScript — no `any` types
- Follow NestJS module pattern: each feature gets its own module
- Keep controllers thin, business logic in services
- Use environment variables for configuration (via @nestjs/config)

## Architecture decisions

- No Docker for now — run directly with Node.js
- Single-user system — no multi-tenancy or auth needed initially
- LiteLLM integration planned (already running in home k8s cluster)
