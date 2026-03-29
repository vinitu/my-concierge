# Repository Layout

## Goal

Describe how the project should be stored in the repository.

## Current Layout Model

The project stays in one repository.
Right now, `gateway-web`, `assistant-api`, and `assistant-orchestrator` are implemented.
`assistant-memory` is part of the target service layout.
To keep the first version simple, the implemented services live in the repository root.

## Current Top-Level Layout

```text
my-concierge/
  AGENTS.md
  README.md
  docker-compose.yaml
  Makefile
  Dockerfile
  package.json
  package-lock.json
  tsconfig.json
  tsconfig.build.json
  jest.config.ts
  nest-cli.json

  src/
    assistant-api/
    chat/
    observability/
    app.module.ts
    main.ts

  public/
    index.html
    app.js
    styles.css

  test/

  docs/
    overview.md
    requirements.md
    architecture/
    services/
    contracts/
    deployment/
    operations/

  runtime/
    assistant-orchestrator/
      SYSTEM.js
      skills/
      config/
      data/
      logs/
      cache/
    gateway-web/
      conversations/
      data/
      logs/
      cache/
```

## Why The Current Layout Is Small

- There are only a few real services today.
- The code stays easy to read.
- There is no extra monorepo framework yet.
- The repository does not create shared packages before they are needed.

## Future Layout Model

When more services are implemented, the repository may move to a multi-application layout.

## Future Top-Level Layout

```text
my-concierge/
  apps/
    assistant-api/
    assistant-memory/
    assistant-orchestrator/
    gateway-telegram/
    gateway-email/
    gateway-web/
    assistant-scheduler/

  packages/
    contracts/
    assistant-api-client/
    observability/
```

## Shared Packages

Only a small number of shared packages should exist.

- `packages/contracts`: shared HTTP, callback, and queue contracts
- `packages/assistant-api-client`: shared client for `assistant-api`
- `packages/observability`: shared status and metrics helpers

## Storage Rules

- Until there is more than one real service, service code may stay in the repository root.
- When more services are implemented, service code should move to `apps/`.
- Shared code should move to `packages/` only after duplication becomes real.
- Documentation should live in `docs/`.
- The repository should keep source code separate from runtime data.

## Why This Layout

- It keeps the repository simple.
- It still leaves room for the future multi-service design.
- It avoids building a monorepo too early.
