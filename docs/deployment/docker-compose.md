# Deployment: Docker Compose

## Goal

Describe the default local runtime.

## Target Service Topology

- `mysql`
- `assistant-api`
- `assistant-worker`
- `assistant-memory`
- `dashboard`
- `gateway-web`
- `gateway-telegram`
- `gateway-email`

## Current Local Example

- `mysql` is part of the local example and stores canonical conversation and memory data
- `gateway-web` is built from the repository root
- `gateway-telegram` is built from the repository root
- `gateway-email` is built from the repository root
- `assistant-api` is built from the repository root
- `assistant-worker` is built from the repository root
- `assistant-memory` is built from the repository root
- `dashboard` is built from the repository root
- `queue` uses Redis in the local example
- `assistant-api` uses `QUEUE_ADAPTER=redis`
- `assistant-worker` uses `QUEUE_ADAPTER=redis`
- `assistant-worker` uses `ASSISTANT_MEMORY_URL=http://assistant-memory:3000`
- `assistant-worker` and `assistant-memory` use MySQL connection settings that point to the `mysql` container
- `assistant-worker` can use DeepSeek, xAI, or local Ollama
- `assistant-worker` mounts `./runtime/assistant-worker` into the container as `/app/runtime`
- `gateway-web` mounts `./runtime/gateway-web` into the container as `/app/runtime`
- `gateway-telegram` mounts `./runtime/gateway-telegram` into the container as `/app/runtime`
- `gateway-email` mounts `./runtime/gateway-email` into the container as `/app/runtime`
- `dashboard` polls every service over HTTP and refreshes the browser tiles every `DASHBOARD_REFRESH_SECONDS`
- runtime files are provided only through the Docker Compose bind volume and are not copied into the image
- Docker Compose reads local values from `.env`
- the schema must be prepared with `npm run db:migrate` before `assistant-worker` and `assistant-memory` can use MySQL successfully
- `make build` builds the local runtime images
- `make up` starts the local example stack
- `make down` stops it

## Required Environment

Before starting the local stack:

```bash
make env
```

Then fill the provider settings you want to use.

For `deepseek`:

- `DEEPSEEK_API_KEY`

For `xai`:

- `XAI_API_KEY`

For local Ollama:

- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`

Available variables in `.env.example`:

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_MODEL`
- `DEEPSEEK_TIMEOUT_MS`
- `XAI_API_KEY`
- `XAI_BASE_URL`
- `XAI_MODEL`
- `XAI_TIMEOUT_MS`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `OLLAMA_TIMEOUT_MS`
- `ASSISTANT_DATADIR`
- `GATEWAY_WEB_RUNTIME_DIR`
- `GATEWAY_TELEGRAM_RUNTIME_DIR`
- `GATEWAY_EMAIL_RUNTIME_DIR`
- `DASHBOARD_REFRESH_SECONDS`
- `WORKER_POLL_INTERVAL_MS`

Default `ASSISTANT_DATADIR` in the local Docker Compose setup:

```text
/app/runtime
```

Default `GATEWAY_WEB_RUNTIME_DIR` in the local Docker Compose setup:

```text
/app/runtime
```

Default `GATEWAY_TELEGRAM_RUNTIME_DIR` and `GATEWAY_EMAIL_RUNTIME_DIR` in the local Docker Compose setup:

```text
/app/runtime
```

Runtime volume in the local Docker Compose setup:

```text
./runtime/assistant-worker:/app/runtime
./runtime/gateway-web:/app/runtime
./runtime/gateway-telegram:/app/runtime
./runtime/gateway-email:/app/runtime
```

Default `OLLAMA_BASE_URL` in the local Docker Compose setup:

```text
http://host.docker.internal:11434
```

This lets the `assistant-worker` container reach the Ollama process running on the host machine in Docker Desktop.
Default `OLLAMA_MODEL` is `gemma3:1b`.

## Port Model

- App services use internal port `3000`.
- `mysql` uses internal port `3306`.
- `dashboard` is exposed on host port `8080`.
- `gateway-web` is exposed on host port `8079`.
- `gateway-telegram` is exposed on host port `8081`.
- `gateway-email` is exposed on host port `8082`.
- `assistant-api` is exposed on host port `3000`.
- `assistant-worker` is exposed on host port `3001`.
- `assistant-memory` is exposed on host port `3002`.
- `assistant-scheduler` is not part of the current local Compose stack.

## Current Flow

```text
browser -> gateway-web -> assistant-api -> redis -> assistant-worker -> redis -> assistant-api -> callback
```

## Current Runtime Coverage

- `assistant-api`, `assistant-worker`, `assistant-memory`, `queue`, `dashboard`, `gateway-web`, `gateway-telegram`, `gateway-email`, and `swagger` are implemented in this repository.
- `assistant-scheduler` is a documented service and can be added to the local stack when implemented.
