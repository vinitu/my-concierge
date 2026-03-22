# Contract: assistant-worker System Prompt

## Goal

Describe what `assistant-worker` sends to the LLM as the runtime system prompt and what response format `assistant-worker` expects back.

The repository prompt template lives in:

- [`prompts/user-prompt.md`](/Users/vinitu/Projects/vinitu/my-concierge/prompts/user-prompt.md)

## Prompt Layers

For each queued request, `assistant-worker` builds one composed system prompt with:

- a short text contract that explains `request_format` and `response_format`
- one JSON object that contains the actual request payload

1. runtime instructions
   - system instructions
   - behavior instructions
   - identity statements
2. conversation state
   - `context` from `runtime/assistant-worker/conversations/{direction}/{chat}/{contact}.json`
   - recent full messages from the same conversation JSON
3. current request
   - the current queued user request as JSON

## Runtime Instruction Block

The system prompt contains these runtime arrays inside the top-level JSON object:

- `system_instructions`
- `behavior`
- `identity`

Meaning:

- `system_instructions`: array of operating rules and execution constraints
- `behavior`: array of behavior instructions, tone, and boundaries
- `identity`: array of identity statements and role descriptions

The default assistant system prompt template uses placeholders like:

```text
{{request}}
```

## Conversation Block

The conversation part includes:

- `context`: compact persistent working memory of the dialogue
- `messages`: the recent full messages kept in the configured `memory_window`
- the current incoming user request

`{{conversation_context_json}}` is inserted as a JSON string.
It should preserve useful working state for future turns, not only general user profile facts.

`{{recent_messages}}` is inserted as a JSON array with this shape:

```json
[
  {
    "role": "user",
    "content": "привет",
    "created_at": "2026-03-22T10:00:00.000Z"
  },
  {
    "role": "assistant",
    "content": "Привет. Как дела?",
    "created_at": "2026-03-22T10:00:02.000Z"
  }
]
```

`{{conversation_message}}` is inserted as a JSON object with this shape:

```json
{
  "direction": "api",
  "chat": "direct",
  "contact": "alex",
  "message": "What time should dinner be ready?"
}
```

## Full Example

Example composed input for a request:

```text
{
  "system_instructions": [
    "Follow the project rules.",
    "Be concise.",
    "Do not mention internal implementation details unless asked."
  ],
  "behavior": [
    "Stay calm in the dialogue.",
    "Preserve a natural conversational tone.",
    "Be direct and practical.",
    "Keep responses concise by default.",
    "Be helpful without unnecessary explanation."
  ],
  "identity": [
    "You are MyConcierge, a personal home assistant for one household."
  ],
  "conversation_context": "Alex is planning dinner and asked to keep answers short.",
  "recent_messages": [
    {
      "role": "user",
      "content": "What is for dinner?",
      "created_at": "2026-03-22T10:00:00.000Z"
    },
    {
      "role": "assistant",
      "content": "Pasta is planned.",
      "created_at": "2026-03-22T10:00:02.000Z"
    },
    {
      "role": "user",
      "content": "Add salad too.",
      "created_at": "2026-03-22T10:01:00.000Z"
    }
  ],
  "current_user_message": {
    "direction": "api",
    "chat": "direct",
    "contact": "alex",
    "message": "What time should dinner be ready?"
  },
  "task": [
    "Answer as the assistant inside the dialogue.",
    "Preserve continuity with the conversation history and context."
  ]
}
```

## Purpose Of This Structure

This structure gives the LLM:

- stable operating rules from runtime files
- compressed long-running and active-topic conversation context
- a short recent message window from the configured `memory_window`
- the exact current request that needs an answer now

## Expected LLM Response

For each request, `assistant-worker` expects exactly one JSON object:

```json
{
  "message": "assistant reply text",
  "context": "updated compact conversation context"
}
```

Rules:

- `message` is required
- `message` must be a non-empty string
- `context` is required
- `context` must be a string
- `context` may be empty only if there is nothing useful to keep
- `context` should usually preserve the active topic, important entities, and unresolved intent when relevant
- no extra keys are needed
- no markdown fences should wrap the JSON
- no text should appear before or after the JSON object

`assistant-worker` parses this JSON, sends `message` through the callback, and stores `context` back into the conversation file.
Return plain text only.
```
