# Specification: assistant-scheduler

## Purpose

`assistant-scheduler` manages recurring jobs that dispatch canonical assistant requests on a schedule.

## Responsibilities

- Store, list, update, delete, and run scheduled jobs.
- Support internal loop mode and external dispatch mode.
- Calculate `next_run_at`, `last_run_at`, `last_request_id`, and `last_error`.
- Dispatch due jobs through `assistant-api`.
- Expose `/config`, `/status`, `/metrics`, and `/openapi.json`.

## Constraints

- Must dispatch work through `assistant-api`, not directly to `assistant-orchestrator`.
- Must keep job payloads typed and explicit.
- Must not own LLM logic, gateway logic, or durable memory logic.

## API Contract

- `GET /config`, `PUT /config`
  Scheduler runtime config including loop mode and poll interval.
- `GET /v1/jobs`
- `POST /v1/jobs`
- `PUT /v1/jobs/:jobId`
- `DELETE /v1/jobs/:jobId`
- `POST /v1/jobs/:jobId/run`
- `POST /v1/dispatch-due`
- `GET /status`, `GET /metrics`, `GET /openapi.json`

## Internal Flows

- Persist jobs in the local scheduler runtime store.
- When the loop is enabled, poll due jobs on an interval.
- On each dispatch, send a canonical request to `assistant-api`, then update run timestamps and errors.

## Dependencies

- `assistant-api`
- Local runtime config/store files.

## Metrics

- HTTP request duration/status metrics.
- Scheduled jobs total.
- Dispatch attempts/success/failure counters.
- Next due or due-now gauges where applicable.
