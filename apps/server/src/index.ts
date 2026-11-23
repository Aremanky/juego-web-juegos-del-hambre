import { mkdir } from 'node:fs/promises';
import { config } from './config';
import { buildApp } from './app';
import { runMigrations } from './db/client';

async function main() {
  await mkdir(config.uploadDir, { recursive: true });
  const { app, ctx } = await buildApp(config);
  await runMigrations(ctx.db);
  app.log.info('migraciones aplicadas');

  await app.listen({ host: config.HOST, port: config.PORT });
  app.log.info(`${config.APP_NAME} escuchando en http://${config.HOST}:${config.PORT}`);

  const cleanup = setInterval(() => void ctx.auth.cleanupExpired().catch(() => undefined), 6 * 3600 * 1000);
  cleanup.unref();

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'apagando…');
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    try {
      await ctx.roomManager.shutdown();
      ctx.io?.close();
      await app.close();
      await ctx.pool.end();
      process.exit(0);
    } catch (e) {
      app.log.error({ err: e }, 'error al apagar');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((e) => {
  console.error('Fallo al arrancar:', e);
  process.exit(1);
});
