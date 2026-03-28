# Runtime Architecture

## Goal

Describe the runtime model of `assistant`.

## Runtime Model

- The local runtime is named `assistant`.
- `assistant` is centered on `assistant-api`, `assistant-worker`, and `assistant-memory`.
- Redis sits between `assistant-api` and `assistant-worker` in both directions.
- Both runtime parts start from the same repository working directory.
- Runtime parts load their own files from separate runtime directories under `./runtime`.

## Data Directory

The repository contains separate runtime directories in `./runtime`.
`assistant-worker` reads bootstrap runtime context from `./runtime/assistant-worker`.
`gateway-web` stores runtime config in `./runtime/gateway-web`.
In Docker Compose, each service mounts its own runtime directory into the container as `/app/runtime`.

Expected layout:

```text
runtime/
  assistant-worker/
    SYSTEM.js
    SOUL.js
    IDENTITY.js
    skills/
    config/
      worker.json
    data/
    logs/
    cache/
  gateway-web/
    config/
      gateway-web.json
    data/
    logs/
    cache/
```

## Runtime Files

- `runtime/assistant-worker/SYSTEM.js`: operating rules
- `runtime/assistant-worker/SOUL.js`: tone and boundaries
- `runtime/assistant-worker/IDENTITY.js`: who the assistant is
- `runtime/assistant-worker/skills/`: skill definitions
- `runtime/gateway-web/config/gateway-web.json`: gateway-web runtime config

Repository-owned files:

- `prompts/user-prompt.md`: the prompt template used by `assistant-worker`

## Memory

Durable memory lives behind `assistant-memory`, not in runtime files.

Current direction:

- `assistant-memory` owns durable profile and memory records
- MySQL stores the canonical memory data
- `assistant-worker` calls `assistant-memory` for memory search and memory write operations
- `runtime/assistant-worker/memory/` may remain only as an optional bootstrap knowledge directory

## Conversations

Conversation state is stored in MySQL.

Current direction:

- conversation turns live in canonical database tables
- rolling summaries live in canonical database tables
- `assistant-worker` owns conversation persistence
- per-conversation locking protects concurrent mutation

## LLM Runtime Input

For each request, `assistant-worker` builds the provider input from:

- `SYSTEM.js`
- `SOUL.js`
- `IDENTITY.js`
- conversation summary from canonical storage
- recent conversation turns from canonical storage
- retrieved memory from `assistant-memory`
- the current queued user request

## Startup Rules

1. Read the configured runtime directory paths.
2. Validate required runtime files and folders.
3. Load `runtime/assistant-worker/IDENTITY.js`, `runtime/assistant-worker/SOUL.js`, and `runtime/assistant-worker/SYSTEM.js`.
4. Load the repository prompt template from `prompts/user-prompt.md`.
5. Keep `runtime/assistant-worker/skills/` available for local skill definitions.
6. Connect `assistant-worker` to MySQL for conversation state.
7. Connect `assistant-worker` to `assistant-memory` for durable memory operations.
8. Connect `assistant-api` and `assistant-worker` to Redis for jobs and run events.
9. Keep `runtime/gateway-web/config/gateway-web.json` available for gateway-web runtime config.
10. Build one shared runtime context model.
11. Start `assistant-api`.
12. Start `assistant-worker`.
13. Start `assistant-memory`.
14. Start `gateway-web`.

## Container Port Rule

- App services should use the same internal port in containers.
- The current Docker Compose example uses internal port `3000` for app services.
