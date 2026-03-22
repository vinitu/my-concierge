import { Controller, Get } from '@nestjs/common';

@Controller()
export class GatewayWebOpenApiController {
  @Get('openapi.json')
  getOpenApi(): Record<string, unknown> {
    return {
      openapi: '3.0.0',
      info: {
        title: 'gateway-web',
        version: '1.0.0',
        description:
          'Web chat gateway for browser clients. It serves the chat page, accepts WebSocket messages, receives assistant callbacks, and exposes operational endpoints.',
      },
      paths: {
        '/': {
          get: {
            summary: 'Get the web chat page',
            responses: {
              '200': {
                description: 'Chat page HTML',
              },
            },
          },
        },
        '/conversation': {
          delete: {
            summary: 'Clear the current browser conversation history',
            responses: {
              '200': {
                description: 'Conversation history cleared',
              },
            },
          },
        },
        '/response/{conversationId}': {
          post: {
            summary: 'Receive the final assistant response for a browser conversation',
            parameters: [
              {
                name: 'conversationId',
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
                    required: ['message'],
                    properties: {
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'Response accepted and mapped to a browser session',
              },
            },
          },
        },
        '/thinking/{conversationId}': {
          post: {
            summary: 'Receive a thinking callback for a browser conversation',
            parameters: [
              {
                name: 'conversationId',
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
                    required: ['seconds'],
                    properties: {
                      seconds: { type: 'integer', minimum: 1 },
                    },
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'Thinking state accepted and mapped to a browser session',
              },
            },
          },
        },
        '/status': {
          get: {
            summary: 'Get gateway-web status',
            responses: {
              '200': {
                description: 'Service is ready',
              },
            },
          },
        },
        '/metrics': {
          get: {
            summary: 'Get gateway-web Prometheus metrics',
            responses: {
              '200': {
                description: 'Prometheus metrics output',
              },
            },
          },
        },
        '/openapi.json': {
          get: {
            summary: 'Get gateway-web OpenAPI schema',
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
