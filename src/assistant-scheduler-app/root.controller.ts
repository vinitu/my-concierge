import { Controller, Get, Header } from "@nestjs/common";

@Controller()
export class AssistantSchedulerRootController {
  @Get()
  @Header("Content-Type", "text/html; charset=utf-8")
  getRoot(): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>assistant-scheduler</title>
    <style>
      body { font-family: sans-serif; margin: 2rem; line-height: 1.5; }
      code { background: #f4f4f4; padding: 0.1rem 0.3rem; border-radius: 4px; }
    </style>
  </head>
  <body>
    <h1>assistant-scheduler</h1>
    <p>Periodic scheduler that dispatches predefined jobs to assistant-api.</p>
    <ul>
      <li><a href="/config">/config</a></li>
      <li><a href="/v1/jobs">/v1/jobs</a></li>
      <li><a href="/status">/status</a></li>
      <li><a href="/openapi.json">/openapi.json</a></li>
    </ul>
  </body>
</html>`;
  }
}
