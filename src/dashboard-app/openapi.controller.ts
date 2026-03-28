import { Controller, Get } from '@nestjs/common';

@Controller()
export class DashboardOpenApiController {
  @Get('openapi.json')
  getOpenApi(): Record<string, unknown> {
    return {
      openapi: '3.0.0',
      info: {
        title: 'dashboard',
        version: '1.0.0',
        description:
          'Service dashboard with links to service panels and aggregated runtime statuses.',
      },
      paths: {
        '/': { get: { summary: 'Get dashboard page', responses: { '200': { description: 'HTML dashboard' } } } },
        '/services/catalog': { get: { summary: 'Get dashboard service catalog', responses: { '200': { description: 'Service catalog' } } } },
        '/services/status': { get: { summary: 'Get aggregated service statuses', responses: { '200': { description: 'Service statuses' } } } },
        '/{service}': { get: { summary: 'Open proxied service root by prefix', responses: { '200': { description: 'Proxied service response' } } } },
        '/{service}/{path}': { get: { summary: 'Open proxied service path by prefix', responses: { '200': { description: 'Proxied service response' } } } },
        '/status': { get: { summary: 'Get dashboard status', responses: { '200': { description: 'Service status' } } } },
        '/metrics': { get: { summary: 'Get dashboard metrics', responses: { '200': { description: 'Prometheus metrics' } } } },
        '/openapi.json': { get: { summary: 'Get dashboard OpenAPI schema', responses: { '200': { description: 'OpenAPI schema' } } } },
      },
    };
  }
}
