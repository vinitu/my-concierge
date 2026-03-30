# Service Specifications

This directory contains the canonical specifications for each microservice in the MyConcierge platform.

## Strict Adherence Rule

1.  **Specification is the Law**: No code or documentation change is allowed to deviate from these specifications.
2.  **Verify First**: Before any change, check the relevant specification file(s).
3.  **Request for Deviation**: If a requirement contradicts a specification, you **MUST** ask the user for permission to update the specification first.
4.  **Cascading Updates**: If a specification is changed, all affected microservices MUST be updated to match the new spec.

## Specification Structure

Each specification file follows this layout:
- **Purpose**: High-level goal of the service.
- **Responsibilities**: What the service MUST do.
- **Constraints**: What the service MUST NOT do.
- **API Contract**: Detailed endpoint, request, and response definitions.
- **Internal Flows**: Key internal logic and state transitions.
- **Dependencies**: External and internal service dependencies.
- **Metrics**: Required Prometheus metrics.

## List of Services

- [assistant-api](assistant-api.md)
- [assistant-orchestrator](assistant-orchestrator.md)
- [assistant-llm](assistant-llm.md)
- [assistant-memory](assistant-memory.md)
- [assistant-scheduler](assistant-scheduler.md)
- [gateway-web](gateway-web.md)
- [gateway-email](gateway-email.md)
- [gateway-telegram](gateway-telegram.md)
- [dashboard](dashboard.md)
