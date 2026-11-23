import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from './schema';

export type DB = ReturnType<typeof createDb>['db'];

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
  const db = drizzle(pool, { schema });
  return { pool, db };
}

/** Carpeta de migraciones: funciona igual con tsx (src/db) que con el bundle (dist). */
export function migrationsFolder(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [resolve(here, '../drizzle'), resolve(here, '../../drizzle'), resolve(process.cwd(), 'drizzle'), resolve(process.cwd(), 'apps/server/drizzle')];
  const found = candidates.find((p) => existsSync(resolve(p, 'meta/_journal.json')));
  if (!found) throw new Error(`No se encuentran las migraciones (buscado en: ${candidates.join(', ')})`);
  return found;
}

export async function runMigrations(db: DB): Promise<void> {
  await migrate(db, { migrationsFolder: migrationsFolder() });
}
