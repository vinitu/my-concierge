# Deployment: Kubernetes

## Goal

Describe the target cluster runtime.

## Main Rules

- `assistant-api` runs as a scalable deployment
- `assistant-worker` runs as a scalable deployment
- `assistant-scheduler` runs as `CronJob` when it is schedule-based
- Queue runs as its own service
- Prometheus reads `/metrics`

## Health Rules

- Each runtime component exposes `GET /status`
- Kubernetes health checks should use `GET /status`
