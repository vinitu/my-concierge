# Runtime Conversations

Store conversation runtime files in this directory.

In V1 each conversation is stored as:

```text
runtime/assistant-worker/conversations/{direction}/{chat}/{contact}.json
```

The JSON file keeps:

- the recent full messages from the configured `memory_window`
- `context` with compact memory of older conversation state
- conversation identifiers and `updated_at`
