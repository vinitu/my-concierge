import { ConfigService } from '@nestjs/config';
import {
  createPool,
  type Pool,
  type PoolConnection,
  type RowDataPacket,
} from 'mysql2/promise';
import { MYSQL_MIGRATIONS } from './mysql-migrations';

function toMysqlDateTime(value: Date): string {
  return value.toISOString().slice(0, 23).replace('T', ' ');
}

export async function createMysqlMigrationPool(configService: ConfigService): Promise<Pool> {
  const url = configService.get<string>('MYSQL_URL', '').trim();

  if (url.length > 0) {
    return createPool({
      connectionLimit: 2,
      uri: url,
    });
  }

  return createPool({
    connectionLimit: Number.parseInt(
      configService.get<string>('MYSQL_CONNECTION_LIMIT', '2'),
      10,
    ),
    database: configService.get<string>('MYSQL_DATABASE', 'my_concierge'),
    host: configService.get<string>('MYSQL_HOST', '127.0.0.1'),
    password: configService.get<string>('MYSQL_PASSWORD', ''),
    port: Number.parseInt(configService.get<string>('MYSQL_PORT', '3306'), 10),
    user: configService.get<string>('MYSQL_USER', 'root'),
  });
}

export async function ensureMigrationTable(connection: PoolConnection): Promise<void> {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version BIGINT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at DATETIME(3) NOT NULL
    )
  `);
}

export async function runMysqlMigrations(pool: Pool): Promise<void> {
  const connection = await pool.getConnection();

  try {
    await ensureMigrationTable(connection);
    const [rows] = await connection.query<Array<RowDataPacket & { version: number }>>(
      `
        SELECT version
        FROM schema_migrations
        ORDER BY version ASC
      `,
    );
    const applied = new Set(rows.map((row) => Number(row.version)));

    for (const migration of MYSQL_MIGRATIONS) {
      if (applied.has(migration.version)) {
        continue;
      }

      await connection.beginTransaction();

      try {
        for (const statement of migration.statements) {
          await connection.query(statement);
        }

        await connection.query(
          `
            INSERT INTO schema_migrations (version, name, applied_at)
            VALUES (?, ?, ?)
          `,
          [migration.version, migration.name, toMysqlDateTime(new Date())],
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }
  } finally {
    connection.release();
  }
}
