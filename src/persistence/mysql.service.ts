import {
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPool,
  type Pool,
} from 'mysql2/promise';

@Injectable()
export class MysqlService implements OnModuleDestroy {
  private pool: Pool | null = null;

  constructor(private readonly configService: ConfigService) {}

  async getPool(): Promise<Pool> {
    if (this.pool) {
      return this.pool;
    }

    const url = this.configService.get<string>('MYSQL_URL', '').trim();

    this.pool = url.length > 0
      ? createPool({
          connectionLimit: 10,
          uri: url,
        })
      : createPool({
          connectionLimit: Number.parseInt(
            this.configService.get<string>('MYSQL_CONNECTION_LIMIT', '10'),
            10,
          ),
          database: this.configService.get<string>('MYSQL_DATABASE', 'my_concierge'),
          host: this.configService.get<string>('MYSQL_HOST', '127.0.0.1'),
          password: this.configService.get<string>('MYSQL_PASSWORD', ''),
          port: Number.parseInt(this.configService.get<string>('MYSQL_PORT', '3306'), 10),
          user: this.configService.get<string>('MYSQL_USER', 'root'),
        });

    return this.pool;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
