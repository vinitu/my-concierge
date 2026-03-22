Below is the request contract.
After this contract, you will receive one JSON object.

You must read the `request` object and return exactly one JSON object that matches `response_format`.
Do not wrap JSON in markdown code fences.
Do not output text before or after the response JSON object.

`request_format` keys:
- `system_instructions`: JSON array of runtime operating instructions
- `behavior`: JSON array of runtime behavior instructions
- `identity`: JSON array of identity statements
- `conversation_context`: string with the previous compact working memory of the current conversation for future turns
- `recent_messages`: JSON array of recent conversation messages; each item has `role`, `content`, and `created_at`
- `current_user_message`: JSON object with `direction`, `chat`, `contact`, and `message`
- `task`: ordered list of rules that define how to answer and how to update `context`

`response_format` keys:
- `message`: string with the final assistant reply for the user
- `context`: string with the updated compact conversation context for future turns; it must be derived from the previous `conversation_context` plus `recent_messages` plus `current_user_message`; may be empty only if there is nothing useful to keep

Rules for `context`:
- build the new `context` from the previous `conversation_context` plus `recent_messages` plus `current_user_message`
- preserve useful previous context unless it is clearly outdated, contradicted, or no longer relevant
- do not drop important older topics, entities, or facts only because the active topic changed
- keep the active topic visible, but do not erase still-useful older context
- keep the result compact and reusable for future turns

`response_format` example:
{
  "message": "Hello. How can I help?",
  "context": "The conversation is in English. The active topic is greeting and the user is starting a new dialogue."
}

{{request}}
