import { eq } from 'drizzle-orm';
import { config } from '../config';
import { createDb } from '../db/client';
import { users } from '../db/schema';

/** Uso: npm run admin:promote -- <usuario> [--demote] */
const [username, flag] = process.argv.slice(2);
if (!username) {
  console.error('Uso: npm run admin:promote -- <usuario> [--demote]');
  process.exit(1);
}
const { pool, db } = createDb(config.DATABASE_URL);
const role = flag === '--demote' ? 'user' : 'admin';
db.update(users)
  .set({ role })
  .where(eq(users.usernameLower, username.toLowerCase()))
  .returning({ id: users.id })
  .then((rows) => {
    console.log(rows.length ? `«${username}» ahora tiene el rol ${role}.` : `No existe el usuario «${username}».`);
    return pool.end();
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
