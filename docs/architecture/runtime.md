# Runtime Architecture

## Goal

Describe the runtime model of `assistant`.

## Runtime Model

- The local runtime is named `assistant`.
- `assistant` is split into `assistant-api` and `assistant-worker`.
- A queue sits between the two runtime parts.
- Both runtime parts start from the same repository working directory.
- Runtime parts load their own files from separate runtime directories under `./runtime`.

## Data Directory

The repository contains separate runtime directories in `./runtime`.
`assistant-worker` reads runtime context from `./runtime/assistant-worker`.
`gateway-web` stores browser chat state in `./runtime/gateway-web`.
In Docker Compose, each service mounts its own runtime directory into the container as `/app/runtime`.

Expected layout:

```text
runtime/
  assistant-worker/
    SYSTEM.js
    SOUL.js
    IDENTITY.js
    skills/
    memory/
    conversations/
    config/
      worker.json
    data/
    logs/
    cache/
  gateway-web/
    conversations/
    data/
    logs/
    cache/
```

## Runtime Files

- `runtime/assistant-worker/SYSTEM.js`: operating rules
- `runtime/assistant-worker/SOUL.js`: tone and boundaries
- `runtime/assistant-worker/IDENTITY.js`: who the assistant is
- `runtime/assistant-worker/skills/`: skill definitions
- `runtime/assistant-worker/memory/`: assistant memory files
- `runtime/assistant-worker/conversations/`: per-chat conversation runtime files
- `runtime/gateway-web/conversations/`: per-session browser chat history

Repository-owned files:

- `prompts/user-prompt.md`: the prompt template used by `assistant-worker`

## Memory

In the current runtime, `runtime/assistant-worker/memory/` is a file-based read-only memory source for `assistant-worker`.

Current rules:

- memory lives in `runtime/assistant-worker/memory/`
- memory is stored as regular files, typically markdown
- `assistant-worker` keeps this directory as prepared runtime memory
- memory is not injected into the LLM request in the current version
- the worker does not automatically write new memory in V1

## Conversations

In the current runtime, `runtime/assistant-worker/conversations/` stores per-chat JSON state for `assistant-worker`.

Current rules:

- conversation files live in `runtime/assistant-worker/conversations/{direction}/{chat}/{contact}.json`
- each file stores the last `memory_window` full messages from `runtime/assistant-worker/config/worker.json`
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

1. Read the configured runtime directory paths.
2. Validate required runtime files and folders.
3. Load `runtime/assistant-worker/IDENTITY.js`, `runtime/assistant-worker/SOUL.js`, and `runtime/assistant-worker/SYSTEM.js`.
4. Load the repository prompt template from `prompts/user-prompt.md`.
5. Load `runtime/assistant-worker/memory/`.
6. Keep `runtime/assistant-worker/conversations/` available for worker context.
7. Keep `runtime/gateway-web/conversations/` available for browser chat history.
8. Keep `runtime/assistant-worker/skills/` available for future runtime versions.
9. Build one shared runtime context model.
10. Start `assistant-api`.
11. Start `assistant-worker`.
12. Start `gateway-web`.

## Container Port Rule

- App services should use the same internal port in containers.
- The current Docker Compose example uses internal port `3000` for app services.
