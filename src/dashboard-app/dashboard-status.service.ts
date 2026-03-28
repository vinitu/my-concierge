import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPool,
  type RowDataPacket,
} from 'mysql2/promise';
import { createClient } from 'redis';
import {
  DashboardServiceDefinition,
  DashboardServiceRegistryService,
} from './dashboard-service-registry.service';

export interface DashboardServiceStatus extends DashboardServiceDefinition {
  ready: boolean | null;
  response_time_ms: number | null;
  service_status: string;
  uptime_seconds: number | null;
}

@Injectable()
export class DashboardStatusService {
  constructor(
    private readonly configService: ConfigService,
    private readonly dashboardServiceRegistryService: DashboardServiceRegistryService,
  ) {}

  async listStatuses(): Promise<DashboardServiceStatus[]> {
    const services = this.dashboardServiceRegistryService.list();
    return Promise.all(services.map(async (service) => this.fetchStatus(service)));
  }

  refreshSeconds(): number {
    const configured = Number.parseInt(
      this.configService.get<string>('DASHBOARD_REFRESH_SECONDS', '5'),
      10,
    );
    return Number.isFinite(configured) ? Math.max(1, configured) : 5;
  }

  private async fetchStatus(
    service: DashboardServiceDefinition,
  ): Promise<DashboardServiceStatus> {
    if (service.name === 'redis') {
      return this.fetchRedisStatus(service);
    }

    if (service.name === 'mysql') {
      return this.fetchMysqlStatus(service);
    }

    if (!service.status_url) {
      return {
        ...service,
        ready: null,
        response_time_ms: null,
        service_status: 'not_exposed',
        uptime_seconds: null,
      };
    }

    const startedAt = process.hrtime.bigint();

    try {
      const response = await fetch(service.status_url);
      const responseTimeMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

      if (!response.ok) {
        return {
          ...service,
          ready: false,
          response_time_ms: responseTimeMs,
          service_status: `http_${String(response.status)}`,
          uptime_seconds: null,
        };
      }

      const payload = (await response.json()) as {
        ready?: boolean;
        status?: string;
        uptime_seconds?: number;
      };

      return {
        ...service,
        ready: payload.ready ?? true,
        response_time_ms: responseTimeMs,
        service_status: payload.status ?? 'ok',
        uptime_seconds:
          typeof payload.uptime_seconds === 'number'
            ? payload.uptime_seconds
            : null,
      };
    } catch {
      return {
        ...service,
        ready: false,
        response_time_ms: null,
        service_status: 'unreachable',
        uptime_seconds: null,
      };
    }
  }

  private async fetchRedisStatus(
    service: DashboardServiceDefinition,
  ): Promise<DashboardServiceStatus> {
    const startedAt = process.hrtime.bigint();
    const client = createClient({
      socket: {
        connectTimeout: 3000,
      },
      url: this.configService.get<string>('REDIS_URL', 'redis://queue:6379'),
    });

    try {
      await client.connect();
      const info = await client.info('server');
      const responseTimeMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const uptimeSeconds = this.parseRedisUptimeSeconds(info);

      return {
        ...service,
        ready: true,
        response_time_ms: responseTimeMs,
        service_status: 'ok',
        uptime_seconds: uptimeSeconds,
      };
    } catch {
      return {
        ...service,
        ready: false,
        response_time_ms: null,
        service_status: 'unreachable',
        uptime_seconds: null,
      };
    } finally {
      if (client.isOpen) {
        await client.quit().catch(() => undefined);
      }
    }
  }

  private async fetchMysqlStatus(
    service: DashboardServiceDefinition,
  ): Promise<DashboardServiceStatus> {
    const startedAt = process.hrtime.bigint();
    const pool = createPool(this.mysqlConnectionOptions());

    try {
      const [rows] = await pool.query<Array<RowDataPacket & { Value?: number | string }>>(
        "SHOW GLOBAL STATUS LIKE 'Uptime'",
      );
      const responseTimeMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const uptimeSeconds = this.parseMysqlUptimeSeconds(rows);

      return {
        ...service,
        ready: true,
        response_time_ms: responseTimeMs,
        service_status: 'ok',
        uptime_seconds: uptimeSeconds,
      };
    } catch {
      return {
        ...service,
        ready: false,
        response_time_ms: null,
        service_status: 'unreachable',
        uptime_seconds: null,
      };
    } finally {
      await pool.end().catch(() => undefined);
    }
  }

  private mysqlConnectionOptions(): {
    connectTimeout: number;
    database: string;
    host: string;
    password: string;
    port: number;
    user: string;
  } {
    return {
      connectTimeout: 3000,
      database: this.configService.get<string>('MYSQL_DATABASE', 'my_concierge'),
      host: this.configService.get<string>('MYSQL_HOST', 'mysql'),
      password: this.configService.get<string>('MYSQL_PASSWORD', ''),
      port: Number.parseInt(this.configService.get<string>('MYSQL_PORT', '3306'), 10),
      user: this.configService.get<string>('MYSQL_USER', 'root'),
    };
  }

  private parseRedisUptimeSeconds(info: string): number | null {
    const match = info.match(/^uptime_in_seconds:(\d+)$/m);

    if (!match) {
      return null;
    }

    return Number.parseInt(match[1], 10);
  }

  private parseMysqlUptimeSeconds(
    rows: Array<RowDataPacket & { Value?: number | string }>,
  ): number | null {
    const value = rows[0]?.Value;

    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.floor(value);
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseInt(value.trim(), 10);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return null;
  }
}
