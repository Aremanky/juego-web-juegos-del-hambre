import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: process.env.E2E_CHANNEL ?? 'chrome',
    locale: 'es-ES',
    trace: 'retain-on-failure',
  },
  outputDir: 'e2e/.artifacts/results',
  webServer: {
    // Servidor real con el frontend compilado (mismo origen, como en producción). Requiere `npm run build -w @ceniza/web`.
    // Se limpia la BD E2E justo antes de arrancar (Playwright lanza webServer antes que globalSetup).
    command: 'npx tsx e2e/reset-db.ts && npx tsx apps/server/src/index.ts',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NODE_ENV: 'development',
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgres://ceniza:ceniza@127.0.0.1:5432/ceniza_e2e',
      UPLOAD_DIR: '/tmp/ceniza-e2e-uploads',
      SERVE_STATIC: 'true',
      STATIC_DIR: 'apps/web/dist',
      LOG_LEVEL: 'warn',
      MATCH_LOBBY_COUNTDOWN_MS: '1500',
      MATCH_PRESENTATION_MS: '4000',
      MATCH_COUNTDOWN_MS: '2000',
    },
  },
});
