import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DashboardAppModule } from '../src/dashboard-app/dashboard-app.module';
import { DashboardServiceRegistryService } from '../src/dashboard-app/dashboard-service-registry.service';
import {
  DashboardStatusService,
  type DashboardServiceStatus,
} from '../src/dashboard-app/dashboard-status.service';

describe('dashboard (e2e)', () => {
  let app: NestExpressApplication;
  const registryServices = [
    {
      key: 'assistant-api',
      kind: 'application',
      name: 'assistant-api',
      notes: 'Ingress',
      upstream_url: 'http://assistant-api:3000',
      prefix: '/assistant-api',
      panel_url: 'http://localhost:3000',
      status_url: 'http://assistant-api:3000/status',
      config_path: null,
      entities: [],
    },
    {
      key: 'assistant-worker',
      kind: 'application',
      name: 'assistant-worker',
      notes: 'Worker runtime',
      upstream_url: 'http://assistant-worker:3000',
      prefix: '/assistant-worker',
      panel_url: 'http://localhost:3001',
      status_url: 'http://assistant-worker:3000/status',
      config_path: '/config',
      entities: [{ id: 'provider-status', label: 'Provider status', path: '/provider-status' }],
    },
    {
      key: 'redis',
      kind: 'infrastructure',
      name: 'redis',
      notes: 'Redis transport',
      upstream_url: null,
      prefix: null,
      panel_url: null,
      status_url: null,
      config_path: null,
      entities: [],
    },
  ] as const;
  const registry = {
    list: jest.fn().mockReturnValue(registryServices),
    findByKey: jest.fn((key: string) => registryServices.find((service) => service.key === key) ?? null),
  };
  const statusService = {
    listStatuses: jest.fn<Promise<DashboardServiceStatus[]>, []>().mockResolvedValue([
      {
        key: 'assistant-api',
        kind: 'application',
        name: 'assistant-api',
        notes: 'Ingress',
        upstream_url: 'http://assistant-api:3000',
        prefix: '/assistant-api',
        panel_url: 'http://localhost:3000',
        ready: true,
        response_time_ms: 12.4,
        service_status: 'ok',
        status_url: 'http://assistant-api:3000/status',
        uptime_seconds: 321,
        config_path: null,
        entities: [],
      },
      {
        key: 'assistant-worker',
        kind: 'application',
        name: 'assistant-worker',
        notes: 'Worker runtime',
        upstream_url: 'http://assistant-worker:3000',
        prefix: '/assistant-worker',
        panel_url: 'http://localhost:3001',
        ready: false,
        response_time_ms: null,
        service_status: 'unreachable',
        status_url: 'http://assistant-worker:3000/status',
        uptime_seconds: null,
        config_path: '/config',
        entities: [{ id: 'provider-status', label: 'Provider status', path: '/provider-status' }],
      },
      {
        key: 'redis',
        kind: 'infrastructure',
        name: 'redis',
        notes: 'Redis transport',
        upstream_url: null,
        prefix: null,
        panel_url: null,
        ready: null,
        response_time_ms: null,
        service_status: 'not_exposed',
        status_url: null,
        uptime_seconds: null,
        config_path: null,
        entities: [],
      },
    ]),
    refreshSeconds: jest.fn().mockReturnValue(5),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DashboardAppModule],
    })
      .overrideProvider(DashboardServiceRegistryService)
      .useValue(registry)
      .overrideProvider(DashboardStatusService)
      .useValue(statusService)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders dashboard page with service menu and status tiles', async () => {
    const response = await request(app.getHttpServer()).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('dashboard');
    expect(response.text).toContain('Unified panel for all services.');
    expect(response.text).toContain('service-menu');
    expect(response.text).toContain('/services/catalog');
  });

  it('returns aggregated service statuses for polling', async () => {
    const response = await request(app.getHttpServer()).get('/services/status');
    expect(response.status).toBe(200);
    expect(response.body.refresh_seconds).toBe(5);
    expect(response.body.services).toHaveLength(3);
    expect(response.body.services[0].name).toBe('assistant-api');
  });

  it('returns service catalog', async () => {
    const response = await request(app.getHttpServer()).get('/services/catalog');
    expect(response.status).toBe(200);
    expect(response.body.refresh_seconds).toBe(5);
    expect(response.body.services).toHaveLength(3);
    expect(response.body.services[1].key).toBe('assistant-worker');
  });

  it('returns dashboard status', async () => {
    const response = await request(app.getHttpServer()).get('/status');
    expect(response.status).toBe(200);
    expect(response.body.service).toBe('dashboard');
  });

  it('returns dashboard metrics and openapi schema', async () => {
    const metrics = await request(app.getHttpServer()).get('/metrics');
    expect(metrics.status).toBe(200);
    expect(metrics.text).toContain('endpoint_requests_total');

    const openapi = await request(app.getHttpServer()).get('/openapi.json');
    expect(openapi.status).toBe(200);
    expect(openapi.body.info.title).toBe('dashboard');
    expect(openapi.body.paths['/']).toBeDefined();
    expect(openapi.body.paths['/services/status']).toBeDefined();
  });
});
