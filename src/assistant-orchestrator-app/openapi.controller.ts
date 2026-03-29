import { Controller, Get } from '@nestjs/common';

@Controller()
export class AssistantOrchestratorOpenApiController {
  @Get('openapi.json')
  getOpenApi(): Record<string, unknown> {
    return {
      openapi: '3.0.0',
      info: {
        title: 'assistant-orchestrator',
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
                      brave_api_key: { type: 'string' },
                      brave_base_url: { type: 'string' },
                      brave_timeout_ms: { type: 'integer', minimum: 1000, maximum: 3600000 },
                      enabled_tools: {
                        type: 'array',
                        items: {
                          type: 'string',
                          enum: [
                            'time_current',
                            'web_search',
                            'memory_search',
                            'memory_preference_search',
                            'memory_fact_search',
                            'memory_routine_search',
                            'memory_project_search',
                            'memory_episode_search',
                            'memory_rule_search',
                            'memory_preference_write',
                            'memory_fact_write',
                            'memory_routine_write',
                            'memory_project_write',
                            'memory_episode_write',
                            'memory_rule_write',
                            'memory_conversation_search',
                            'skill_execute',
                          ],
                        },
                      },
                      memory_window: { type: 'integer', minimum: 1, maximum: 20 },
                      run_timeout_seconds: { type: 'integer', minimum: 5, maximum: 600 },
                      thinking_interval_seconds: { type: 'integer', minimum: 1, maximum: 30 },
                    },
                    required: [
                      'memory_window',
                      'run_timeout_seconds',
                      'thinking_interval_seconds',
                      'brave_api_key',
                      'brave_base_url',
                      'brave_timeout_ms',
                      'enabled_tools',
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
        '/models': {
          get: {
            summary: 'Get available models grouped by provider',
            responses: {
              '200': {
                description: 'Provider model catalog for UI selection',
              },
            },
          },
        },
        '/skills': {
          get: {
            summary: 'List local runtime skills visible to assistant-orchestrator',
            responses: {
              '200': {
                description: 'List of local skill filenames',
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
