# Service: scheduler

## Purpose

Run cron-based tasks and trigger `assistant-api`.

## Responsibilities

- Run jobs on a cron schedule
- Call `assistant-api`
- Expose `GET /status`
- Expose `GET /metrics`

## Main Endpoints

- `GET /status`
- `GET /metrics`

## Rules

- The scheduler stays thin.
- It does not run assistant business logic.
- In Kubernetes, scheduled jobs should use `CronJob`.
