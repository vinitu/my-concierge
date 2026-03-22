# Service: gateway-telegram

## Purpose

Receive Telegram events and send Telegram replies.

## Responsibilities

- Accept Telegram inbound events
- Convert them to `assistant-api` requests
- Expose callback endpoints for Telegram replies
- Expose `GET /status`
- Expose `GET /metrics`

## Main Endpoints

- `POST /inbound/telegram`
- `POST /callbacks/assistant`
- `GET /status`
- `GET /metrics`

## Rules

- The gateway stays thin.
- Assistant business logic does not live here.
- Telegram callbacks should point to `gateway-telegram`.
