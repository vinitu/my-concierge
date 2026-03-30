---
name: specify
description: Manage microservice specifications in docs/specifications/ and synchronize them with implementation. Use when adding requirements, changing service behavior, or validating system consistency against documentation.
---

# Skill: specify

This skill enforces a specification-first development workflow. No code or documentation change is allowed to deviate from the canonical specifications.

## Canonical Specifications

The following files are the only valid specification targets:

- `docs/specifications/assistant-api.md`
- `docs/specifications/assistant-orchestrator.md`
- `docs/specifications/assistant-llm.md`
- `docs/specifications/assistant-memory.md`
- `docs/specifications/assistant-scheduler.md`
- `docs/specifications/gateway-web.md`
- `docs/specifications/gateway-email.md`
- `docs/specifications/gateway-telegram.md`
- `docs/specifications/dashboard.md`

## Workflow

### 1. Select Specification
Identify and select the necessary specification file(s) from the list above based on the microservices involved in the task.

### 2. Update Requirements
- Add or modify the required specifications in the chosen file(s).
- **User Confirmation**: If the requested change contradicts the current specification, you **MUST** ask the user for permission to change the requirements in the specification first.
- **Strict Adherence**: Do not proceed with code changes until the specification is updated and confirmed.

### 3. Mutual Validation
- Validate all requirements against each other across all specification files.
- **Zero Conflict Policy**: There must be no disagreements or contradictions between different specifications (e.g., ensuring a service's "Must Not" doesn't conflict with another's "Must").

### 4. Implementation Validation
- Validate the updated requirements against the current implementation (source code, tests, configuration).
- Identify all discrepancies between the new specification and the existing code.

### 5. Cascading Implementation
- Make the necessary changes to the implementation of all microservices that now contradict the updated specification.
- Ensure the final codebase is 100% consistent with the documented requirements.

## Specification Sections

- **Purpose**: High-level goal.
- **Responsibilities**: Mandatory actions/features.
- **Constraints**: Mandatory "must not" rules.
- **API Contract**: Endpoints, payloads, status codes.
- **Internal Flows**: Logic, state transitions, queue interactions.
- **Dependencies**: Other services, databases, external APIs.
- **Metrics**: Required Prometheus metrics.

## Strict Rules

1.  **Specification is Law**: Never implement something not in the spec or contradicting the spec.
2.  **Cascading Updates**: If you change a spec, you MUST update the implementation of all affected microservices.
3.  **No Implicit Deviations**: If you observe a bug or a missing feature in the spec, do not fix it in code without updating the spec first.
