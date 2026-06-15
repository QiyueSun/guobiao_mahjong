import 'dotenv/config';
import path from 'path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getDb } from './client';
import { logger } from '../logger';

async function main(): Promise<void> {
  await migrate(getDb(), { migrationsFolder: path.join(__dirname, 'migrations') });
  logger.info('Database migrations applied');
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, 'Database migration failed');
  process.exit(1);
});
