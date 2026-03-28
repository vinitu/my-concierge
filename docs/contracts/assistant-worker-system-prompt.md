# Contract: assistant-worker System Prompt

## Goal

Describe what `assistant-worker` sends into the LangChain.js runtime and which structured output the worker expects back from the assistant execution loop.

## Context Layers

For each queued request, `assistant-worker` builds one execution input from four layers:

1. bootstrap context
   - `SYSTEM.js`
2. conversation context
   - rolling summary from MySQL
   - recent conversation turns from MySQL
3. durable memory context
   - ranked entries returned by `assistant-memory`
4. current request
   - current queued user request and channel metadata

## Bootstrap Instruction Block

The bootstrap part contains these arrays inside the top-level input object:

- `system_instructions`
- `behavior`
- `identity`

Meaning:

- `system_instructions`: operating rules and execution constraints
- `behavior`: tone, style, and response boundaries
- `identity`: identity statements and role descriptions

## Conversation Block

The conversation part includes:

- `conversation_summary`
- `recent_messages`
- `current_user_message`

Suggested shape for `recent_messages`:

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

Suggested shape for `current_user_message`:

```json
{
  "direction": "web",
  "chat": "direct",
  "contact": "session_123",
  "conversation_id": "session_123",
  "message": "What time should dinner be ready?"
}
```

## Durable Memory Block

The durable memory part includes ranked entries returned by `assistant-memory`.

Suggested shape:

```json
[
  {
    "id": "mem_1",
    "kind": "preference",
    "scope": "user",
    "content": "The user prefers concise answers.",
    "score": 0.92
  },
  {
    "id": "mem_2",
    "kind": "project",
    "scope": "household",
    "content": "Dinner planning for tonight includes pasta and salad.",
    "score": 0.81
  }
]
```

## Tool Block

The worker runtime exposes these model-callable tools:

- `time_current`
- `memory_search`
- `memory_write`
- `conversation_search`
- `skill_execute`

Rules:

- tools are invoked through the LangChain.js runtime, not by direct gateway callbacks
- `memory_search` and `memory_write` map to `assistant-memory`
- `conversation_search` reads canonical conversation state from MySQL
- `skill_execute` maps to local skill definitions
- raw infrastructure access is never exposed as a model tool

## Full Example

Example composed input for one request:

```json
{
  "system_instructions": [
    "Follow the project rules.",
    "Be concise.",
    "Do not mention internal implementation details unless asked."
  ],
  "behavior": [
    "Stay calm in the dialogue.",
    "Preserve a natural conversational tone.",
    "Be direct and practical."
  ],
  "identity": [
    "You are MyConcierge, a personal home assistant for one household."
  ],
  "conversation_summary": "The user is planning dinner and asked to keep answers short.",
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
  "retrieved_memory": [
    {
      "id": "mem_1",
      "kind": "preference",
      "scope": "user",
      "content": "The user prefers concise answers.",
      "score": 0.92
    }
  ],
  "current_user_message": {
    "direction": "web",
    "chat": "direct",
    "contact": "session_123",
    "conversation_id": "session_123",
    "message": "What time should dinner be ready?"
  }
}
```

## Expected Worker Output

For each request, `assistant-worker` expects one structured result from the execution loop:

```json
{
  "message": "Dinner should be ready by 19:00.",
  "conversation_summary": "Dinner planning continues for tonight.",
  "memory_writes": [
    {
      "kind": "episode",
      "scope": "household",
      "content": "Dinner plan for tonight is pasta and salad."
    }
  ]
}
```

Rules:

- `message` is required
- `message` must be a non-empty string
- `conversation_summary` is optional but recommended when the summary changes
- `memory_writes` is optional and contains durable memory candidates
- no raw callback data belongs in this output
- no text should appear before or after the structured payload

## Worker Handling Rules

- `assistant-worker` persists conversation turns and updated summaries in MySQL
- `assistant-worker` submits `memory_writes` candidates to `assistant-memory`
- `assistant-worker` publishes run events to Redis
- `assistant-api` consumes those run events and performs gateway callbacks
