# Runtime Architecture

## Goal

Describe the runtime model of `assistant`.

## Runtime Model

- The local runtime is named `assistant`.
- `assistant` is split into `assistant-api` and `assistant-worker`.
- A queue sits between the two runtime parts.
- Both runtime parts start from the same working directory.
- Both runtime parts load the same runtime files.

## Data Directory

The working directory is also the `data dir`.

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

1. Read the working directory path.
2. Validate required files and folders.
3. Load `IDENTITY.md`, `SOUL.md`, and `AGENTS.md`.
4. Load `skills/` and `memory/`.
5. Build one shared runtime context.
6. Start `assistant-api`.
7. Start `assistant-worker`.

## Container Port Rule

- App services should use the same internal port in containers.
- The current Docker Compose example uses internal port `3000` for app services.
