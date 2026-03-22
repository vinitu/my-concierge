# Runtime Architecture

## Goal

Describe the runtime model of `assistant`.

## Runtime Model

- The local runtime is named `assistant`.
- `assistant` is split into `assistant-api` and `assistant-worker`.
- A queue sits between the two runtime parts.
- Both runtime parts start from the same repository working directory.
- Both runtime parts load the same runtime files from a separate `datadir`.

## Data Directory

The repository contains a separate runtime `datadir` in `./runtime`.
`assistant-worker` reads runtime context from this directory.
In Docker Compose, this directory is mounted into the container as `/app/runtime`.

Expected layout:

```text
runtime/
  SYSTEM.js
  SOUL.js
  IDENTITY.js
  prompts/
  skills/
  memory/
  conversations/
  config/
    worker.json
  data/
  logs/
  cache/
```

## Runtime Files

- `SYSTEM.js`: operating rules
- `SOUL.js`: tone and boundaries
- `IDENTITY.js`: who the assistant is
- `prompts/`: editable prompt templates for `assistant-worker`
- `skills/`: skill definitions
- `memory/`: assistant memory files
- `conversations/`: per-chat conversation runtime files

## Memory

In the current runtime, `memory/` is a file-based read-only memory source for `assistant-worker`.

Current rules:

- memory lives in `runtime/memory/`
- memory is stored as regular files, typically markdown
- `assistant-worker` keeps this directory as prepared runtime memory
- memory is not injected into the LLM request in the current version
- the worker does not automatically write new memory in V1

## Conversations

In the current runtime, `conversations/` stores per-chat JSON state for `assistant-worker`.

Current rules:

- conversation files live in `runtime/conversations/{direction}/{chat}/{contact}.json`
- each file stores the last `memory_window` full messages from `runtime/config/worker.json`
- each file also stores a compact `context` summary for older conversation state
- when old messages are evicted from the configured recent-message window, `assistant-worker` asks the active LLM provider to merge them into `context`

## LLM Runtime Input

For each request, `assistant-worker` builds the provider input from:

- `SYSTEM.js`
- `SOUL.js`
- `IDENTITY.js`
- conversation `context`
- the last conversation messages from the configured `memory_window`
- the current queued user request

## Startup Rules

1. Read the configured `datadir` path.
2. Validate required runtime files and folders.
3. Load `IDENTITY.js`, `SOUL.js`, and `SYSTEM.js`.
4. Load `memory/`.
5. Keep `conversations/` available for future runtime versions.
6. Keep `skills/` available for future runtime versions.
7. Build one shared runtime context model.
8. Start `assistant-api`.
9. Start `assistant-worker`.

## Container Port Rule

- App services should use the same internal port in containers.
- The current Docker Compose example uses internal port `3000` for app services.
