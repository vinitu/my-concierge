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

Expected layout:

```text
runtime/
  AGENTS.md
  SOUL.md
  IDENTITY.md
  skills/
  memory/
  data/
  logs/
  cache/
```

## Runtime Files

- `AGENTS.md`: operating rules
- `SOUL.md`: tone and boundaries
- `IDENTITY.md`: who the assistant is
- `skills/`: skill definitions
- `memory/`: assistant memory files

## Startup Rules

1. Read the configured `datadir` path.
2. Validate required runtime files and folders.
3. Load `IDENTITY.md`, `SOUL.md`, and `AGENTS.md`.
4. Load `memory/`.
5. Keep `skills/` available for future runtime versions.
6. Build one shared runtime context model.
7. Start `assistant-api`.
8. Start `assistant-worker`.

## Container Port Rule

- App services should use the same internal port in containers.
- The current Docker Compose example uses internal port `3000` for app services.
