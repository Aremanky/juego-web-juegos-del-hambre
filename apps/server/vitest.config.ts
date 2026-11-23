import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    fileParallelism: false, // comparten la base de datos de pruebas
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://ceniza:ceniza@127.0.0.1:5432/ceniza_test',
      UPLOAD_DIR: '/tmp/ceniza-test-uploads',
      MAX_UPLOAD_MB: '4',
      LOG_LEVEL: 'silent',
      SERVE_STATIC: 'false',
    },
  },
});
