import { Controller, Get } from '@nestjs/common';

@Controller()
export class AssistantWorkerOpenApiController {
  @Get('openapi.json')
  getOpenApi(): Record<string, unknown> {
    return {
      openapi: '3.0.0',
      info: {
        title: 'assistant-worker',
        version: '1.0.0',
        description:
          'Background worker for queued assistant jobs. It reads queue messages, processes them, sends callbacks, and exposes operational endpoints.',
      },
      paths: {
        '/': {
          get: {
            summary: 'Get worker root endpoint',
            responses: {
              '200': {
                description: 'Service entrypoint summary',
              },
            },
          },
        },
        '/status': {
          get: {
            summary: 'Get worker status',
            responses: {
              '200': {
                description: 'Worker is ready',
              },
            },
          },
        },
        '/metrics': {
          get: {
            summary: 'Get worker metrics',
            responses: {
              '200': {
                description: 'Prometheus metrics output',
              },
            },
          },
        },
        '/openapi.json': {
          get: {
            summary: 'Get worker OpenAPI schema',
            responses: {
              '200': {
                description: 'OpenAPI schema document',
              },
            },
          },
        },
      },
    };
  }
}
