# Service: assistant-api

## Purpose

`assistant-api` is the public intake service.

## Responsibilities

- Accept conversation requests
- Validate path and body
- Write accepted work to the queue
- Select the queue adapter from environment variables
- Return immediate acceptance responses
- Expose `GET /status`
- Expose `GET /metrics`
- Expose `GET /openapi.json`

## Must Not Do

- Run assistant business logic
- Call LLM providers for conversation processing
- Send callback messages

## Main Endpoints

- `POST /conversation/<direction>/<chat>/<contact>`
- `GET /status`
- `GET /metrics`
- `GET /openapi.json`

## Queue Adapter

- `assistant-api` should choose its queue adapter through env
- `QUEUE_ADAPTER=redis` means Redis queue storage
- `REDIS_URL` defines the Redis connection string
- `REDIS_QUEUE_NAME` defines the Redis list name
- Redis is the current default adapter
- `QUEUE_ADAPTER=file` remains available as a fallback

## Metrics

- Request counters
- Queue depth
- Startup metrics

## Status

- Reports API readiness
- Should be simple and fast
