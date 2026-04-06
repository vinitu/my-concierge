import {
  Controller,
  Get,
  Header,
} from '@nestjs/common';

@Controller()
export class AssistantLlmRootController {
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  getRoot(): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>assistant-llm</title>
    <style>
      body { font-family: sans-serif; margin: 2rem; line-height: 1.5; }
      code { background: #f4f4f4; padding: 0.1rem 0.3rem; border-radius: 4px; }
    </style>
  </head>
  <body>
    <h1>assistant-llm</h1>
    <p>Centralized LLM configuration and generation service.</p>
    <ul>
      <li><a href="/config">/config</a></li>
      <li><a href="/provider">/provider</a></li>
      <li><a href="/models">/models</a></li>
      <li><code>POST /models/ollama/:model/download</code></li>
      <li><a href="/status">/status</a></li>
      <li><a href="/openapi.json">/openapi.json</a></li>
    </ul>
  </body>
</html>`;
  }
}
