/**
 * Medidor del mapa para el banco de rendimiento (`playwright.perf.config.ts`). Solo existe si la página crea
 * `window.__cenizaPerf`; si no, cada llamada es una comprobación vacía. `ms` acumula el tiempo de cada parte del
 * fotograma y `off` permite apagar una parte para medir lo que cuesta por diferencia.
 */
export interface PerfProbe {
  frames: number;
  ms: Record<string, number>;
  off: Record<string, boolean>;
}

export function probe(): PerfProbe | undefined {
  return (globalThis as { __cenizaPerf?: PerfProbe }).__cenizaPerf;
}
