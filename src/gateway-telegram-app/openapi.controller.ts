import { Controller, Get } from '@nestjs/common';

@Controller()
export class GatewayTelegramOpenApiController {
  @Get('openapi.json')
  getOpenApi(): Record<string, unknown> {
    return {
      openapi: '3.0.0',
      info: {
        title: 'gateway-telegram',
        version: '1.0.0',
        description:
          'Telegram gateway with local chat runtime, Telegram Bot delivery, and assistant callback endpoints.',
      },
      paths: {
        '/': { get: { summary: 'Get gateway-telegram web panel', responses: { '200': { description: 'HTML panel' } } } },
        '/config': {
          get: { summary: 'Get gateway-telegram config', responses: { '200': { description: 'Current config' } } },
          put: { summary: 'Update gateway-telegram config', responses: { '200': { description: 'Config updated' } } },
        },
        '/threads': { get: { summary: 'List local Telegram threads', responses: { '200': { description: 'Thread list' } } } },
        '/threads/{conversationId}': { get: { summary: 'Get one local Telegram thread', responses: { '200': { description: 'Thread details' } } } },
        '/inbound/telegram': { post: { summary: 'Accept a normalized inbound Telegram payload', responses: { '202': { description: 'Inbound Telegram message accepted' } } } },
        '/response/{conversationId}': { post: { summary: 'Deliver final assistant response by Telegram reply', responses: { '200': { description: 'Reply handled' } } } },
        '/thinking/{conversationId}': { post: { summary: 'Accept a thinking callback for Telegram', responses: { '200': { description: 'Thinking callback acknowledged' } } } },
        '/status': { get: { summary: 'Get gateway-telegram status', responses: { '200': { description: 'Service status' } } } },
        '/metrics': { get: { summary: 'Get gateway-telegram metrics', responses: { '200': { description: 'Prometheus metrics' } } } },
        '/openapi.json': { get: { summary: 'Get gateway-telegram OpenAPI schema', responses: { '200': { description: 'OpenAPI schema' } } } },
      },
    };
  }
}
