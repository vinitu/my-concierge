import { Controller, Get, Header } from '@nestjs/common';

@Controller()
export class AssistantMemoryRootController {
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  getRoot(): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>assistant-memory</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <link
      href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
      rel="stylesheet"
      integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH"
      crossorigin="anonymous"
    />
    <style>
      :root {
        color-scheme: light;
        --mc-ink: #172033;
        --mc-muted: #64748b;
        --mc-line: #d8e0ea;
        --mc-surface: #ffffff;
        --mc-surface-2: #f6f8fb;
        --mc-accent: #0f766e;
      }
      body {
        margin: 0;
        font-family: "Manrope", sans-serif;
        color: var(--mc-ink);
        background:
          radial-gradient(circle at top left, rgba(15, 118, 110, 0.08), transparent 28%),
          linear-gradient(180deg, #f4f7fb 0%, #eef2f7 100%);
      }
      main { max-width: 1040px; margin: 0 auto; padding: 24px 16px 40px; }
      .hero, .card-shell {
        background: var(--mc-surface);
        border: 1px solid var(--mc-line);
        border-radius: 18px;
        box-shadow: 0 10px 30px rgba(23, 32, 51, 0.06);
      }
      .hero { padding: 22px; margin-bottom: 18px; }
      .card-shell { padding: 20px; height: 100%; }
      .eyebrow {
        color: var(--mc-accent);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 12px;
        font-weight: 800;
      }
      h1, h2 { margin: 0 0 10px; }
      p, li { color: var(--mc-muted); }
      .action-link {
        display: inline-flex;
        align-items: center;
        padding: 10px 14px;
        border-radius: 999px;
        background: #172033;
        color: #fff;
        text-decoration: none;
        font-weight: 700;
      }
      code {
        color: var(--mc-accent);
        background: var(--mc-surface-2);
        padding: 2px 6px;
        border-radius: 8px;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div class="eyebrow">Durable Memory</div>
        <h1>assistant-memory</h1>
        <p>Durable memory service for canonical profile, federated retrieval, typed memory writes, archive/compact operations, and operational endpoints.</p>
        <div class="d-flex gap-2 flex-wrap mt-3">
          <a class="action-link" href="/status">Status</a>
          <a class="action-link" href="/metrics">Metrics</a>
          <a class="action-link" href="/openapi.json">OpenAPI</a>
        </div>
      </section>
      <section class="row g-3">
        <div class="col-lg-6">
          <div class="card-shell">
            <h2>Core API</h2>
            <ul class="mb-0 ps-3">
              <li><code>GET /v1/profile</code></li>
              <li><code>PUT /v1/profile</code></li>
              <li><code>POST /v1/search</code></li>
              <li><code>POST /v1/compact</code></li>
              <li><code>POST /v1/reindex</code></li>
            </ul>
          </div>
        </div>
        <div class="col-lg-6">
          <div class="card-shell">
            <h2>Typed Domains</h2>
            <p class="mb-2">Available typed endpoints:</p>
            <p class="mb-0"><code>preferences</code>, <code>facts</code>, <code>routines</code>, <code>projects</code>, <code>episodes</code>, <code>rules</code></p>
          </div>
        </div>
      </section>
    </main>
  </body>
</html>`;
  }
}
