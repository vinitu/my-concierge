# Deployment: Docker Compose

## Goal

Describe the default local runtime.

## Main Services

- `assistant-api`
- `gateway-web`

## Current Local Example

- `gateway-web` is built from the repository root
- `assistant-api` is built from the repository root
- `assistant-worker` is built from the repository root
- `queue` uses Redis in the current local example
- `assistant-api` uses `QUEUE_ADAPTER=redis`
- `assistant-worker` uses `QUEUE_ADAPTER=redis`
- `assistant-worker` uses Grok through the xAI Responses API
- Docker Compose reads local values from `.env`
- `make build` builds the local `gateway-web` image
- `make up` starts the local example stack
- `make down` stops it

## Required Environment

Before starting the local stack:

```bash
make env
```

Then fill at least:

- `XAI_API_KEY`

Available variables in `.env.example`:

- `XAI_API_KEY`
- `XAI_BASE_URL`
- `XAI_MODEL`
- `XAI_TIMEOUT_MS`
- `ASSISTANT_DATADIR`
- `WORKER_POLL_INTERVAL_MS`

Default `ASSISTANT_DATADIR` in the local Docker Compose setup:

```text
/app/runtime
```

## Port Model

- App services use internal port `3000`.
- `gateway-web` is exposed on host port `8080`.
- The local `assistant-api` mock is exposed on host port `3000`.

## Current Flow

```text
browser -> gateway-web -> assistant-api -> redis queue -> assistant-worker -> callback
```

## Future Full Runtime

- The full documented runtime still includes `assistant-worker`, `queue`, channel gateways, `scheduler`, and `swagger`.
- Those services are not implemented in this repository yet.
