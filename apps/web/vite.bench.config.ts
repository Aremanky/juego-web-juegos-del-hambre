import { resolve } from 'node:path';
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';

/** Build del banco de rendimiento del mapa (no va en la aplicación): `npm run bench:build -w @ceniza/web`. */
export default mergeConfig(
  base,
  defineConfig({
    build: {
      outDir: 'dist-bench',
      emptyOutDir: true,
      rollupOptions: { input: { mapa: resolve(__dirname, 'bench/mapa.html') } },
    },
  }),
);
