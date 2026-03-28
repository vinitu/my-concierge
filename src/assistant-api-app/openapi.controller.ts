import { Controller, Get } from '@nestjs/common';

@Controller()
export class AssistantApiOpenApiController {
  @Get('openapi.json')
  getOpenApi(): Record<string, unknown> {
    return {
      openapi: '3.0.0',
      info: {
        title: 'assistant-api',
        version: '1.0.0',
        description:
          'HTTP intake service for assistant conversations. It validates requests, writes jobs to the queue, and exposes operational endpoints.',
      },
      paths: {
        '/': {
          get: {
            summary: 'Get assistant-api root endpoint',
            responses: {
              '200': {
                description: 'Service entrypoint summary',
              },
            },
          },
        },
        '/conversation/{direction}/{chat}/{contact}': {
          post: {
            summary: 'Accept a conversation event',
            parameters: [
              {
                name: 'direction',
                in: 'path',
                required: true,
                schema: { type: 'string', enum: ['api', 'telegram', 'email'] },
              },
              {
                name: 'chat',
                in: 'path',
                required: true,
                schema: { type: 'string' },
              },
              {
                name: 'contact',
                in: 'path',
                required: true,
                schema: { type: 'string' },
              },
            ],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['message', 'callback', 'conversation_id'],
                    properties: {
                      callback: {
                        type: 'object',
                        required: ['base_url'],
                        properties: {
                          base_url: { type: 'string', format: 'uri' },
                        },
                      },
                      conversation_id: { type: 'string' },
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
            responses: {
              '202': {
                description: 'Message accepted for asynchronous processing',
              },
              '400': {
                description: 'Invalid request body',
              },
            },
          },
        },
        '/status': {
          get: {
            summary: 'Get service status',
            responses: {
              '200': {
                description: 'Service is ready',
              },
            },
          },
        },
        '/metrics': {
          get: {
            summary: 'Get Prometheus metrics',
            responses: {
              '200': {
                description: 'Prometheus metrics output',
              },
            },
          },
        },
        '/openapi.json': {
          get: {
            summary: 'Get assistant-api OpenAPI schema',
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
