import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/scripts/migrate.ts', 'src/scripts/promote.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  // El paquete compartido es TS fuente: se incluye en el bundle. El resto de dependencias se instalan en la VM.
  noExternal: ['@ceniza/shared'],
});
