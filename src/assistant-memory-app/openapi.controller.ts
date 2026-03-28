import { Controller, Get } from '@nestjs/common';

@Controller()
export class AssistantMemoryOpenApiController {
  @Get('openapi.json')
  getOpenApi(): Record<string, unknown> {
    const typedPaths = ['preferences', 'facts', 'routines', 'projects', 'episodes', 'rules']
      .flatMap((resource) => [
        [`/v1/${resource}/search`, 'Search active memory entries of one kind'],
        [`/v1/${resource}/write`, 'Persist memory entries of one kind'],
        [`/v1/${resource}/{memoryId}`, 'Get one memory entry of one kind'],
        [`/v1/${resource}/{memoryId}/archive`, 'Archive one memory entry of one kind'],
      ])
      .reduce<Record<string, unknown>>((accumulator, [path, summary]) => {
        if (path.endsWith('/search')) {
          accumulator[path] = {
            post: {
              responses: { '200': { description: 'Ranked search result' } },
              summary,
            },
          };
          return accumulator;
        }

        if (path.endsWith('/write')) {
          accumulator[path] = {
            post: {
              responses: { '200': { description: 'Persisted write result' } },
              summary,
            },
          };
          return accumulator;
        }

        if (path.endsWith('/archive')) {
          accumulator[path] = {
            post: {
              responses: {
                '200': { description: 'Memory archived' },
                '404': { description: 'Memory entry not found' },
              },
              summary,
            },
          };
          return accumulator;
        }

        accumulator[path] = {
          get: {
            responses: {
              '200': { description: 'Single memory entry' },
              '404': { description: 'Memory entry not found' },
            },
            summary,
          },
        };
        return accumulator;
      }, {});

    return {
      info: {
        description:
          'Durable memory service for assistant profile, federated retrieval, typed memory writes, and operational endpoints.',
        title: 'assistant-memory',
        version: '1.0.0',
      },
      openapi: '3.0.0',
      paths: {
        '/': {
          get: {
            responses: { '200': { description: 'Service entrypoint summary' } },
            summary: 'Get assistant-memory root endpoint',
          },
        },
        '/status': {
          get: {
            responses: { '200': { description: 'Service is ready' } },
            summary: 'Get memory service status',
          },
        },
        '/metrics': {
          get: {
            responses: { '200': { description: 'Prometheus metrics output' } },
            summary: 'Get Prometheus metrics',
          },
        },
        '/openapi.json': {
          get: {
            responses: { '200': { description: 'OpenAPI schema document' } },
            summary: 'Get assistant-memory OpenAPI schema',
          },
        },
        '/v1/profile': {
          get: {
            responses: { '200': { description: 'Current canonical profile' } },
            summary: 'Get canonical assistant profile',
          },
          put: {
            responses: { '200': { description: 'Profile updated' } },
            summary: 'Update canonical assistant profile',
          },
        },
        '/v1/search': {
          post: {
            responses: { '200': { description: 'Federated ranked search result' } },
            summary: 'Search across all memory kinds',
          },
        },
        '/v1/compact': {
          post: {
            responses: { '200': { description: 'Memory compacted' } },
            summary: 'Compact duplicate memory entries',
          },
        },
        '/v1/reindex': {
          post: {
            responses: { '200': { description: 'Memory reindex completed' } },
            summary: 'Rebuild memory retrieval metadata',
          },
        },
        '/v1/conversations': {
          get: {
            responses: { '200': { description: 'Conversation thread list' } },
            summary: 'List canonical conversation threads',
          },
        },
        '/v1/conversations/read': {
          post: {
            responses: { '200': { description: 'Conversation state' } },
            summary: 'Read one canonical conversation state',
          },
        },
        '/v1/conversations/append': {
          post: {
            responses: { '200': { description: 'Updated conversation state' } },
            summary: 'Append one user/assistant exchange to canonical conversation state',
          },
        },
        '/v1/conversations/search': {
          post: {
            responses: { '200': { description: 'Conversation search result' } },
            summary: 'Search one conversation thread window and summary',
          },
        },
        ...typedPaths,
      },
    };
  }
}
