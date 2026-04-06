# Specification: dashboard

## Purpose

`dashboard` is the unified operational panel for local runtime services. It exposes a browser UI, a service catalog, and aggregated service status polling.

## Responsibilities

- Render the dashboard UI with known services and sections.
- Return a static service catalog derived from configured service registry entries.
- Poll and aggregate `/status` responses from managed services.
- Trigger explicit service administration actions exposed by managed services when the user uses dashboard controls.
- Expose `/status`, `/metrics`, and `/openapi.json`.

## Constraints

 - Must not mutate service business data directly.
 - May proxy explicit operational actions to managed services, such as provider/model administration controls.
- Must not own queue, LLM, memory, or gateway message flows.
- Infrastructure services without HTTP status endpoints must remain visible as non-exposed entries.

## API Contract

- `GET /`
  Dashboard HTML page.
- `GET /services/catalog`
  Response: `{ "refresh_seconds": number, "services": [...] }`
- `GET /services/status`
  Response: `{ "refresh_seconds": number, "services": [...] }`
- `GET /status`
- `GET /metrics`
- `GET /openapi.json`

## Internal Flows

- Build the service catalog from `DashboardServiceRegistryService`.
- Poll configured `status_url` endpoints and normalize readiness, response time, and service status.
- Surface service entities such as config, models, jobs, skills, or threads where available.

## Dependencies

- Managed application status endpoints.
- Local dashboard service registry config.

## Metrics

- HTTP request duration/status metrics.
- Endpoint request counters.
- Upstream request counters by observed service.
- Gauges for observed service readiness.
