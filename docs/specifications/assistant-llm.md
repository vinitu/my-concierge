# Specification: assistant-llm

## Purpose

`assistant-llm` is the only service that owns provider configuration, model selection, provider readiness checks, and LLM execution for the platform.

## Responsibilities

- Store and return the active provider/model configuration.
- Expose provider readiness and model catalog endpoints.
- Execute conversation agent-loop step requests for `assistant-orchestrator`.
- Execute conversation summarization requests.
- Extract facts and profile patches for `assistant-memory` enrichment.
- Expose `/status`, `/metrics`, and `/openapi.json`.

## Constraints

- Provider and model settings must live only in this service.
- Other services must not duplicate provider-specific request logic.
- Must normalize raw provider output into typed response envelopes.

## API Contract

- `GET /config`, `PUT /config`
  Read and update provider, model, API keys, base URLs, and timeouts.
- `GET /provider`
  Return provider/model selection, enabled flag, and status string.
  `status` must be `ok` when the provider/model is usable, otherwise it must contain a human-readable reason string.
- `GET /models`
  Return a static provider-to-model catalog map.
  Each model entry must include `name`, `enabled`, and `status`.
  The static catalog must contain only tools-capable models for every provider.
  `assistant-llm` must not expose, persist, or select models that do not support native tool calling.
  For providers that require an API key, models must be returned as disabled when the key is missing, with `status` set to `API key is missing`.
  Ollama models must stay in the static catalog, but at assistant-llm startup they must be checked against local `/api/tags` and converted into an enabled-model snapshot.
  Only models that are both present locally and tools-capable may be enabled after startup.
  Any model outside the tools-capable set must stay disabled even if it exists locally.
  Models that are not present locally must be returned as disabled with `status` set to `Model is not available locally`.
  If a stored or requested model is outside the static tools-capable catalog for its provider, `assistant-llm` must normalize it to the provider default model instead of keeping the invalid value.
- `POST /models/ollama/:model/download`
  Download one static catalog Ollama model into the local Ollama instance.
  This endpoint must accept only models from the static tools-capable Ollama catalog.
  After a successful download, `assistant-llm` must refresh the local enabled-model snapshot so `/models` immediately shows the model as enabled.
- `POST /v1/conversation`
  Request one agent-loop step output for a conversation.
  The response may be either a final answer or a tool call for the next loop step.
- `POST /v1/conversation/summarize`
  Return a compact conversation summary string.
- `POST /v1/memory/facts`
  Return normalized fact items.
- `POST /v1/memory/profile`
  Return a profile patch object.
- `GET /status`, `GET /metrics`, `GET /openapi.json`
  Standard operational endpoints.

## API Examples

- `GET /config`

```json
{
  "provider": "ollama",
  "model": "qwen3:1.7b",
  "ollama_base_url": "http://ollama:11434",
  "ollama_timeout_ms": 360000,
  "deepseek_api_key": "",
  "deepseek_base_url": "https://api.deepseek.com",
  "deepseek_timeout_ms": 360000,
  "xai_api_key": "",
  "xai_base_url": "https://api.x.ai/v1",
  "xai_timeout_ms": 360000
}
```

- `GET /provider`

```json
{
  "provider": "ollama",
  "model": "qwen3:1.7b",
  "enabled": false,
  "status": "Ollama is reachable, but model qwen3:1.7b is not available locally"
}
```

- `GET /models`

```json
{
  "models": {
    "deepseek": [
      { "name": "deepseek-chat", "enabled": false, "status": "API key is missing" },
      { "name": "deepseek-reasoner", "enabled": false, "status": "API key is missing" }
    ],
    "ollama": [
      { "name": "qwen3:1.7b", "enabled": false, "status": "Model is not available locally" },
      { "name": "llama3.2:3b", "enabled": true, "status": null },
      { "name": "hermes3:3b", "enabled": true, "status": null }
    ],
    "xai": [
      { "name": "grok-4", "enabled": false, "status": "API key is missing" },
      { "name": "grok-4-latest", "enabled": false, "status": "API key is missing" }
    ]
  }
}
```

### `POST /v1/conversation`

Request:

```json
{
  "messages": [
    { "role": "system", "content": "You are a helpful home assistant." },
    { "role": "user", "content": "What time is it?" }
  ],
  "tools": [
    {
      "name": "time_current",
      "description": "Return current local time",
      "use_when": "The user asks for the current time"
    }
  ]
}
```

Response with tool call:

```json
{
  "type": "tool_call",
  "tool_name": "time_current",
  "tool_arguments": {},
  "message": "",
  "context": "The user asked for the current time."
}
```

Response with final answer:

```json
{
  "type": "final",
  "message": "It is 17:34 in Warsaw.",
  "context": "Answered with the local time."
}
```

- `POST /v1/conversation/summarize`

Request:

```json
{
  "previous_context": "",
  "messages": [
    { "role": "user", "content": "Dinner is at 19:00." },
    { "role": "assistant", "content": "Noted. Dinner is at 19:00." }
  ]
}
```

Response:

```json
{
  "summary": "The user set dinner time to 19:00."
}
```

- `POST /v1/memory/facts`

Request:

```json
{
  "conversation_id": "conv-1",
  "messages": [
    { "role": "user", "content": "I live in Warsaw." }
  ]
}
```

Response:

```json
{
  "items": ["User lives in Warsaw."]
}
```

- `POST /v1/memory/profile`

Request:

```json
{
  "conversation_id": "conv-1",
  "messages": [
    { "role": "user", "content": "Please answer me in Russian." }
  ]
}
```

Response:

```json
{
  "patch": {
    "language": "ru",
    "preferences": {
      "reply_language": "ru"
    }
  }
}
```

## Internal Flows

- Normalize config writes and choose a default model for the selected provider when needed.
- Build the `/models` response from a static in-repo catalog only.
- Keep only tools-capable models in the static catalog and reject non-catalog model selections by normalizing them to the provider default.
- On startup, read Ollama `/api/tags` once and build an enabled-model snapshot by intersecting local models with the tools-capable static catalog.
- Treat every non-tools Ollama model as disabled at startup, even if it is installed locally.
- For `POST /models/ollama/:model/download`, call Ollama `POST /api/pull` with `stream=false`, then refresh the enabled-model snapshot.
- Route requests to the configured provider adapter (`deepseek`, `xai`, or `ollama`).
- Parse planning-like JSON output and fall back to plain message mode when parsing fails.
- Normalize fact extraction into unique third-person statements.

## Dependencies

- External LLM providers: DeepSeek, xAI, and Ollama.
- Local runtime config file for persisted settings.

## Metrics

- HTTP request duration/status metrics.
- Provider health/readiness gauges.
- Upstream request counters and latency metrics by provider and endpoint.
