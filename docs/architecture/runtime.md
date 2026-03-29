# Runtime Architecture

## Goal

Describe the runtime model of `assistant`.

## Runtime Model

- The local runtime is named `assistant`.
- `assistant` is centered on `assistant-api`, `assistant-orchestrator`, `assistant-llm`, and `assistant-memory`.
- Redis sits between `assistant-api` and `assistant-orchestrator` in both directions.
- Both runtime parts start from the same repository working directory.
- Runtime parts load their own files from separate runtime directories under `./runtime`.

## Data Directory

The repository contains separate runtime directories in `./runtime`.
`assistant-orchestrator` reads bootstrap runtime context from `./runtime/assistant-orchestrator`.
`assistant-llm` reads provider config from `./runtime/assistant-llm`.
`gateway-web` stores runtime config in `./runtime/gateway-web`.
In Docker Compose, each service mounts its own runtime directory into the container as `/app/runtime`.

Expected layout:

```text
runtime/
  assistant-orchestrator/
    SYSTEM.js
    skills/
    config/
      worker.json
    data/
    logs/
    cache/
  assistant-llm/
    config/
      llm.json
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

- `runtime/assistant-orchestrator/SYSTEM.js`: operating rules
- `runtime/assistant-orchestrator/skills/`: skill definitions
- `runtime/assistant-llm/config/llm.json`: LLM provider and model settings
- `runtime/gateway-web/config/gateway-web.json`: gateway-web runtime config

## Memory

Durable memory lives behind `assistant-memory`, not in runtime files.

Current direction:

- `assistant-memory` owns durable profile and memory records
- MySQL stores the canonical memory data
- `assistant-orchestrator` calls `assistant-memory` for memory search and memory write operations
- `assistant-orchestrator` calls `assistant-llm` for main and summary generation
- `assistant-memory` enrichment calls `assistant-llm` for typed extraction
- `runtime/assistant-orchestrator/memory/` may remain only as an optional bootstrap knowledge directory

## Conversations

Conversation state is stored in MySQL.

Current direction:

- conversation turns live in canonical database tables
- rolling summaries live in canonical database tables
- `assistant-memory` owns canonical conversation persistence
- per-conversation locking protects concurrent mutation

## LLM Runtime Input

For each request, `assistant-orchestrator` builds messages input for `assistant-llm` from:

- `SYSTEM.js`
- conversation summary from canonical storage
- recent conversation turns from canonical storage
- retrieved memory from `assistant-memory`
- the current queued user request

## Startup Rules

1. Read the configured runtime directory paths.
2. Validate required runtime files and folders.
3. Load `runtime/assistant-orchestrator/SYSTEM.js`.
4. Keep `runtime/assistant-orchestrator/skills/` available for local skill definitions.
5. Connect `assistant-orchestrator` to `assistant-memory` for conversations and durable memory operations.
6. Connect `assistant-orchestrator` to `assistant-llm` for model generation.
7. Connect `assistant-memory` to `assistant-llm` for async enrichment extraction.
8. Connect `assistant-api` and `assistant-orchestrator` to Redis for jobs and run events.
9. Keep `runtime/gateway-web/config/gateway-web.json` available for gateway-web runtime config.
10. Build one shared runtime context model.
11. Start `assistant-api`.
12. Start `assistant-orchestrator`.
13. Start `assistant-llm`.
14. Start `assistant-memory`.
15. Start `gateway-web`.

## Container Port Rule

- App services should use the same internal port in containers.
- The current Docker Compose example uses internal port `3000` for app services.
