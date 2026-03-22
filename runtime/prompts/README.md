# Runtime Prompts

Store editable prompt templates for `assistant-worker` in this directory.

Current templates:

- `user-prompt.md`: main system prompt template for normal LLM replies
- `user-prompt.md`: single system prompt template that produces both the user-facing reply and the updated compact conversation context

These files are tracked in git and can be edited to change worker behavior without changing application code.
