import { Controller, Get } from '@nestjs/common';
import { GATEWAY_WEB_ALLOWED_INCOMING_MESSAGE_TYPES } from './chat/gateway-web-config.service';

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
        '/config': {
          get: {
            summary: 'Get gateway-web runtime config',
            responses: {
              '200': {
                description: 'Current gateway-web config',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        assistant_api_url: { type: 'string' },
                        assistant_memory_url: { type: 'string' },
                        allowed_incoming_message_types: {
                          type: 'array',
                          items: {
                            type: 'string',
                            enum: [...GATEWAY_WEB_ALLOWED_INCOMING_MESSAGE_TYPES],
                          },
                        },
                        user_id: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          put: {
            summary: 'Update gateway-web runtime config',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      allowed_incoming_message_types: {
                        type: 'array',
                        items: {
                          type: 'string',
                          enum: [...GATEWAY_WEB_ALLOWED_INCOMING_MESSAGE_TYPES],
                        },
                      },
                    },
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'Updated gateway-web config',
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
        '/event/{conversationId}': {
          post: {
            summary: 'Receive assistant event callback for a browser conversation',
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
                    required: ['type'],
                    properties: {
                      message: { type: 'string' },
                      payload: { type: 'object', additionalProperties: true },
                      type: { type: 'string' },
                    },
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'Event callback accepted and mapped to a browser session',
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
