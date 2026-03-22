# Gateway-Web Conversations

Store browser chat history in this directory.

In V1 each browser session is stored as:

```text
runtime/gateway-web/conversations/{session_id}.json
```

The JSON file keeps:

- the stable `session_id` from the browser cookie
- the full chat message history for that browser session
- `updated_at` for the last stored message
