import { config } from '../config';
import { createDb, runMigrations } from '../db/client';

const { pool, db } = createDb(config.DATABASE_URL);
runMigrations(db)
  .then(() => {
    console.log('Migraciones aplicadas.');
    return pool.end();
  })
  .catch((e) => {
    console.error('Error aplicando migraciones:', e);
    process.exit(1);
  });
