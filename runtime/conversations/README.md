# Runtime Conversations

Store conversation runtime files in this directory.

In V1 each conversation is stored as:

```text
runtime/conversations/{direction}/{chat}/{contact}.json
```

The JSON file keeps:

- the recent full messages from the configured `memory_window`
- `context` with compact memory of older conversation state
- conversation identifiers and `updated_at`

When old messages are pushed out of the configured recent-message window, `assistant-worker` asks the active LLM provider to merge them into `context` and writes the updated JSON back to disk.
