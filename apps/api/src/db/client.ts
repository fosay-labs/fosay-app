import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Postgres via postgres-js; runs pending migrations before returning. */
export async function connectDb(url: string): Promise<{ db: Db; close: () => Promise<void> }> {
  const sql = postgres(url, { max: 10 });
  const db = drizzle(sql, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { db: db as unknown as Db, close: () => sql.end() };
}

export { schema };
