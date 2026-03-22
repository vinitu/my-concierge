# Service: gateway-email

## Purpose

Receive Email events and send Email replies.

## Responsibilities

- Accept Email inbound events
- Convert them to `assistant-api` requests
- Expose callback endpoints for Email replies
- Expose `GET /status`
- Expose `GET /metrics`

## Main Endpoints

- `POST /inbound/email`
- `POST /callbacks/assistant`
- `GET /status`
- `GET /metrics`

## Rules

- The gateway stays thin.
- Assistant business logic does not live here.
