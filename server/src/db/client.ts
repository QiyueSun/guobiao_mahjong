import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema';
import { logger } from '../logger';

let pool: Pool | undefined;
let db: NodePgDatabase<typeof schema> | undefined;

export function getDb(): NodePgDatabase<typeof schema> {
  if (!db) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL ?? 'postgresql://mahjong:mahjong@localhost:5432/mahjong',
    });
    pool.on('error', (err) => logger.error({ err }, 'Postgres pool error'));
    db = drizzle(pool, { schema });
  }
  return db;
}

export async function pingDb(): Promise<boolean> {
  try {
    await getDb().execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
