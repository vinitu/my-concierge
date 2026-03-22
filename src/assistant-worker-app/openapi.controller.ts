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
            summary: 'Get worker settings page',
            responses: {
              '200': {
                description: 'HTML settings page',
              },
            },
          },
        },
        '/config': {
          get: {
            summary: 'Get worker runtime config',
            responses: {
              '200': {
                description: 'Current worker config',
              },
            },
          },
          put: {
            summary: 'Update worker runtime config',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      provider: { type: 'string', enum: ['xai', 'ollama'] },
                    },
                    required: ['provider'],
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'Updated worker config',
              },
            },
          },
        },
        '/provider-status': {
          get: {
            summary: 'Get current LLM provider status',
            responses: {
              '200': {
                description: 'Current provider configuration and reachability status',
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
