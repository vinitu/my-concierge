# Deployment: Docker Compose

## Goal

Describe the default local runtime.

## Main Services

- `assistant-api`
- `assistant-worker`
- `gateway-web`

## Current Local Example

- `gateway-web` is built from the repository root
- `assistant-api` is built from the repository root
- `assistant-worker` is built from the repository root
- `queue` uses Redis in the current local example
- `assistant-api` uses `QUEUE_ADAPTER=redis`
- `assistant-worker` uses `QUEUE_ADAPTER=redis`
- `assistant-worker` can use either xAI or local Ollama
- Docker Compose reads local values from `.env`
- `make build` builds the local `gateway-web` image
- `make up` starts the local example stack
- `make down` stops it

## Required Environment

Before starting the local stack:

```bash
make env
```

Then fill the provider settings you want to use.

For `xai`:

- `XAI_API_KEY`

For local Ollama:

- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`

Available variables in `.env.example`:

- `XAI_API_KEY`
- `XAI_BASE_URL`
- `XAI_MODEL`
- `XAI_TIMEOUT_MS`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `OLLAMA_TIMEOUT_MS`
- `ASSISTANT_DATADIR`
- `WORKER_POLL_INTERVAL_MS`

Default `ASSISTANT_DATADIR` in the local Docker Compose setup:

```text
/app/runtime
```

Default `OLLAMA_BASE_URL` in the local Docker Compose setup:

```text
http://host.docker.internal:11434
```

This lets the `assistant-worker` container reach the Ollama process running on the host machine in Docker Desktop.
Default `OLLAMA_MODEL` is `gemma3:1b`.

## Port Model

- App services use internal port `3000`.
- `gateway-web` is exposed on host port `8080`.
- The local `assistant-api` mock is exposed on host port `3000`.

## Current Flow

```text
browser -> gateway-web -> assistant-api -> redis queue -> assistant-worker -> callback
```

## Current Runtime Coverage

- `assistant-api`, `assistant-worker`, `queue`, `gateway-web`, and `swagger` are implemented in this repository.
- `gateway-telegram`, `gateway-email`, and `scheduler` are still planned services.
