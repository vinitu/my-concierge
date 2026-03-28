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
          'Background worker for queued assistant jobs. It reads queue messages, runs the assistant execution loop, publishes run events, and exposes operational endpoints.',
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
                      deepseek_api_key: { type: 'string' },
                      deepseek_base_url: { type: 'string' },
                      deepseek_timeout_ms: { type: 'integer', minimum: 1000, maximum: 3600000 },
                      memory_window: { type: 'integer', minimum: 1, maximum: 20 },
                      model: { type: 'string' },
                      ollama_base_url: { type: 'string' },
                      ollama_timeout_ms: { type: 'integer', minimum: 1000, maximum: 3600000 },
                      provider: { type: 'string', enum: ['deepseek', 'xai', 'ollama'] },
                      run_timeout_seconds: { type: 'integer', minimum: 5, maximum: 600 },
                      thinking_interval_seconds: { type: 'integer', minimum: 1, maximum: 30 },
                      xai_api_key: { type: 'string' },
                      xai_base_url: { type: 'string' },
                      xai_timeout_ms: { type: 'integer', minimum: 1000, maximum: 3600000 },
                    },
                    required: [
                      'provider',
                      'model',
                      'memory_window',
                      'run_timeout_seconds',
                      'thinking_interval_seconds',
                      'xai_api_key',
                      'xai_base_url',
                      'xai_timeout_ms',
                      'deepseek_api_key',
                      'deepseek_base_url',
                      'deepseek_timeout_ms',
                      'ollama_base_url',
                      'ollama_timeout_ms',
                    ],
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
