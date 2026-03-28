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
  const registry = {
    list: jest.fn().mockReturnValue([
      {
        kind: 'application',
        name: 'assistant-api',
        notes: 'Ingress',
        panel_url: 'http://localhost:3000',
        status_url: 'http://assistant-api:3000/status',
      },
      {
        kind: 'application',
        name: 'gateway-web',
        notes: 'Browser chat',
        panel_url: 'http://localhost:8080',
        status_url: 'http://gateway-web:3000/status',
      },
      {
        kind: 'infrastructure',
        name: 'redis',
        notes: 'Redis transport',
        panel_url: null,
        status_url: null,
      },
    ]),
  };
  const statusService = {
    listStatuses: jest.fn<Promise<DashboardServiceStatus[]>, []>().mockResolvedValue([
      {
        kind: 'application',
        name: 'assistant-api',
        notes: 'Ingress',
        panel_url: 'http://localhost:3000',
        ready: true,
        response_time_ms: 12.4,
        service_status: 'ok',
        status_url: 'http://assistant-api:3000/status',
        uptime_seconds: 321,
      },
      {
        kind: 'application',
        name: 'gateway-web',
        notes: 'Browser chat',
        panel_url: 'http://localhost:8080',
        ready: false,
        response_time_ms: null,
        service_status: 'unreachable',
        status_url: 'http://gateway-web:3000/status',
        uptime_seconds: null,
      },
      {
        kind: 'infrastructure',
        name: 'redis',
        notes: 'Redis transport',
        panel_url: null,
        ready: null,
        response_time_ms: null,
        service_status: 'not_exposed',
        status_url: null,
        uptime_seconds: null,
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

  it('renders dashboard page with links and service statuses', async () => {
    const response = await request(app.getHttpServer()).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('dashboard');
    expect(response.text).toContain('assistant-api');
    expect(response.text).toContain('gateway-web');
    expect(response.text).toContain('redis');
    expect(response.text).toContain('http://localhost:3000');
    expect(response.text).toContain('Auto refresh every 5 seconds.');
    expect(response.text).toContain('UP');
    expect(response.text).toContain('DOWN');
    expect(response.text).toContain('5m 21s');
    expect(response.text).toContain('unreachable');
    expect(statusService.listStatuses).toHaveBeenCalled();
  });

  it('returns aggregated service statuses for polling', async () => {
    const response = await request(app.getHttpServer()).get('/services/status');
    expect(response.status).toBe(200);
    expect(response.body.refresh_seconds).toBe(5);
    expect(response.body.services).toHaveLength(3);
    expect(response.body.services[0].name).toBe('assistant-api');
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
