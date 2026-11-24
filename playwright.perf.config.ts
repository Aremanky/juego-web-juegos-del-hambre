import { defineConfig } from '@playwright/test';

/**
 * Banco de rendimiento del mapa: `npm run bench:build -w @ceniza/web && npx playwright test -c playwright.perf.config.ts`.
 * Chrome sin GPU (como las pruebas), sin servidor de juego: la página del banco monta MapCanvas con una partida
 * generada. Escribe los resultados en e2e/.artifacts/perf.json.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'perf.bench.ts',
  timeout: 300_000,
  workers: 1,
  reporter: [['list']],
  use: { channel: process.env.E2E_CHANNEL ?? 'chrome', locale: 'es-ES' },
  outputDir: 'e2e/.artifacts/perf',
  webServer: {
    command: 'npx vite preview --config vite.bench.config.ts --port 4400 --strictPort --host 127.0.0.1',
    cwd: 'apps/web',
    url: 'http://127.0.0.1:4400/bench/mapa.html',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
