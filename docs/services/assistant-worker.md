# Service: assistant-worker

## Purpose

`assistant-worker` is the queued execution service.

## Responsibilities

- Read jobs from the queue
- Read jobs from Redis queue in the current implementation
- Build a simple reply from the accepted message
- Send callback messages
- Expose `GET /status`
- Expose `GET /metrics`
- Expose `GET /openapi.json`

## Main Endpoints

- `GET /status`
- `GET /metrics`
- `GET /openapi.json`

## Worker Rules

- The worker does not accept public conversation requests.
- The worker reads work only from the queue.
- One queued job may produce zero, one, or many callback messages.
- The current worker logic is simple: it sends back that the message was received.
- The current worker reads Redis queue messages created by `assistant-api`.

## Metrics

- Worker job counters
- Worker job duration
- Callback success and failure metrics
