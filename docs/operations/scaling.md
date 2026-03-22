# Operations: Scaling

## Goal

Describe horizontal scaling rules.

## Main Rules

- `assistant-api` may run in more than one instance
- `assistant-worker` may run in more than one instance
- Queue must support multiple worker instances
- Gateway components may scale when needed

## Boundary Rule

- Scaling must not move business logic into `assistant-api`
