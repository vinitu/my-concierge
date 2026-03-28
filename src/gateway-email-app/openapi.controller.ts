import { Controller, Get } from '@nestjs/common';

@Controller()
export class GatewayEmailOpenApiController {
  @Get('openapi.json')
  getOpenApi(): Record<string, unknown> {
    return {
      openapi: '3.0.0',
      info: {
        title: 'gateway-email',
        version: '1.0.0',
        description:
          'Email gateway with local mailbox runtime, IMAP sync, SMTP replies, and assistant callback delivery.',
      },
      paths: {
        '/': { get: { summary: 'Get gateway-email web panel', responses: { '200': { description: 'HTML panel' } } } },
        '/config': {
          get: { summary: 'Get gateway-email config', responses: { '200': { description: 'Current config' } } },
          put: { summary: 'Update gateway-email config', responses: { '200': { description: 'Config updated' } } },
        },
        '/threads': { get: { summary: 'List local email threads', responses: { '200': { description: 'Thread list' } } } },
        '/threads/{conversationId}': { get: { summary: 'Get one local email thread', responses: { '200': { description: 'Thread details' } } } },
        '/sync': { post: { summary: 'Trigger one mailbox sync', responses: { '200': { description: 'Sync result' } } } },
        '/inbound/email': { post: { summary: 'Accept a normalized inbound email payload', responses: { '202': { description: 'Inbound email accepted' } } } },
        '/response/{conversationId}': { post: { summary: 'Deliver final assistant response by email reply', responses: { '200': { description: 'Reply handled' } } } },
        '/thinking/{conversationId}': { post: { summary: 'Accept a thinking callback for email', responses: { '200': { description: 'Thinking callback acknowledged' } } } },
        '/status': { get: { summary: 'Get gateway-email status', responses: { '200': { description: 'Service status' } } } },
        '/metrics': { get: { summary: 'Get gateway-email metrics', responses: { '200': { description: 'Prometheus metrics' } } } },
        '/openapi.json': { get: { summary: 'Get gateway-email OpenAPI schema', responses: { '200': { description: 'OpenAPI schema' } } } },
      },
    };
  }
}
