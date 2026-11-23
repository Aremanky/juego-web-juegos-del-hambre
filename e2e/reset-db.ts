import { rm } from 'node:fs/promises';
import pg from 'pg';

/** Base de datos E2E limpia en cada ejecución (las migraciones las aplica el servidor al arrancar). */
async function resetE2eDatabase() {
  const url = process.env.E2E_DATABASE_URL ?? 'postgres://ceniza:ceniza@127.0.0.1:5432/ceniza_e2e';
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
  await client.end();
  await rm('/tmp/ceniza-e2e-uploads', { recursive: true, force: true });
}

await resetE2eDatabase();
