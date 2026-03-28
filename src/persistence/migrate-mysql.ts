import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import {
  createMysqlMigrationPool,
  runMysqlMigrations,
} from './mysql-migrator';

async function migrate(): Promise<void> {
  const configService = new ConfigService(process.env);
  const pool = await createMysqlMigrationPool(configService);

  try {
    await runMysqlMigrations(pool);
  } finally {
    await pool.end();
  }
}

void migrate();
