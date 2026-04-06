# Contract: assistant-orchestrator Prompting

## Goal

Define what `assistant-orchestrator` sends to `assistant-llm` during runtime execution and what structured shape it expects from the main generation step.

## Main Request Model

`assistant-orchestrator` sends `messages[]` (role-based chat format) to `assistant-llm /v1/conversation`.

Message composition order:

1. system runtime prompt (from `SYSTEM.js` and runtime instructions)
2. compact conversation context (`conversation.context`)
3. retrieved memory snippets
4. recent turns (`memory_window`)
5. current user turn

The payload is message-first, not one giant concatenated prompt string.

## Main Response Expectation

`assistant-orchestrator` expects text from `assistant-llm` and parses it into one of:

1. final
```json
{
  "final": {
    "message": "string",
    "context": "string",
    "memory_writes": [],
    "tool_observations": []
  }
}
```

2. tool call
```json
{
  "tool_call": {
    "name": "time_current|web_search|memory_search|memory_fact_search|memory_fact_write|memory_conversation_search|skill_execute|directory_list|directory_create|directory_delete|file_delete|file_write|file_read",
    "arguments": {}
  }
}
```

## Runtime Rules

- Exactly one top-level branch: `final` or `tool_call`
- `message` must be a non-empty string for final output
- `tool_call.arguments` must always be an object
- If parsing fails after repair attempts, runtime returns a user-facing fallback reply and finishes run safely

## Summary Step

After final assistant reply, `assistant-orchestrator` sends a separate request to:

- `assistant-llm /v1/conversation/summarize`

Summary result updates `conversation.context`.
Summary failure must not fail the user reply path.

## Memory Extraction Step

`assistant-memory` runs asynchronous enrichment after conversation append and calls:

- `assistant-llm /v1/memory/facts`

This produces:

- fact items

Enrichment failure does not break append API response.
