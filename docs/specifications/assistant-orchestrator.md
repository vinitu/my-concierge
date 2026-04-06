# Specification: assistant-orchestrator

## Purpose

`assistant-orchestrator` executes accepted assistant runs. It reads queue jobs, loads runtime context, retrieves memory, calls `assistant-llm`, dispatches tools, appends the final exchange to `assistant-memory`, and publishes run events.

## Responsibilities

- Poll the execution queue and reserve one job at a time.
- Read canonical conversation state from `assistant-memory`.
- Retrieve federated memory before the main run.
- Call `assistant-llm` for planning and synthesis.
- Execute supported tools: `time_current`, `web_search`, `memory_search`, `memory_fact_search`, `memory_fact_write`, `memory_conversation_search`, `skill_execute`, `directory_list`, `directory_create`, `directory_delete`, `file_delete`, `file_write`, and `file_read`.
- Publish `run.started`, `run.thinking`, `run.tool`, `run.completed`, and `run.failed`.
- Expose `/config`, `/provider`, `/models`, `/skills`, `/conversations`, `/status`, `/metrics`, and `/openapi.json`.

## Constraints

- Must call `assistant-llm` for LLM work. No provider logic may live here.
- Must not call gateway callbacks directly.
- Must not own durable memory storage.
- Must enforce enabled tool settings from runtime config.
- Filesystem tools must stay inside `ASSISTANT_ORCHESTRATOR_HOME` and must reject path traversal or absolute paths outside that directory.

## API Contract

- `GET /config`, `PUT /config`
  Runtime config for memory window, timeout, thinking interval, enabled tools, and Brave settings.
- `GET /provider`
  Proxy provider readiness from `assistant-llm`.
- `GET /models`
  Proxy available model catalog from `assistant-llm`.
- `GET /skills`
  Return local runtime skill files visible in `runtime/assistant-orchestrator/skills`.
- `GET /conversations`
  Return visible conversation thread list from `assistant-memory`.
- `GET /status`, `GET /metrics`, `GET /openapi.json`
  Standard operational endpoints.

## Internal Flows

- Read runtime bootstrap from `runtime/assistant-orchestrator/SYSTEM.js` and runtime config.
- Expand recent conversation context when history reference signals require it.
- Run planning through `assistant-llm`; if a tool call is returned, execute the tool, then run synthesis.
- After each tool execution, publish one `run.tool` event with tool name, success flag, and human-readable message.
- Summarize the conversation after the final assistant message.
- Append the final exchange to `assistant-memory`.
- Read previous conversation messages and rolling context from `assistant-memory` on every run.
- Publish ordered run events with sequence numbers.
- `skill_execute` must load a local skill file from `runtime/assistant-orchestrator/skills`.
- Filesystem tools must operate only under the configured home directory and must use `runtime/assistant-orchestrator/data` in the default Docker Compose setup.

## Dependencies

- Execution queue consumer.
- Run-event publisher.
- `assistant-llm`
- `assistant-memory`
- Brave Search when `web_search` is enabled and configured.
- Runtime files under `runtime/assistant-orchestrator/`.
- Local filesystem home under `ASSISTANT_ORCHESTRATOR_HOME`.

## Metrics

- HTTP request duration/status metrics.
- Queue depth and processed job counters.
- Runtime phase counters.
- Tool invocation counters by tool name and status.
- LLM request/duration metrics for planning and synthesis stages.
