/// <reference lib="webworker" />
/**
 * Prueba de fuerza del editor: simula al personaje contra los ocho arquetipos en cada escenario del
 * simulador de equilibrio. Va en un worker para que el editor no se trabe mientras se reparten puntos.
 */
import { ARCHETYPE_CONTENDERS, SCENARIOS, runMatchups } from '@ceniza/engine';
import type { DerivedInput } from '@ceniza/shared';

/** Enfrentamientos por escenario y rival: ±5 puntos de margen en cada casilla, ±2 en las medias. */
const RUNS = 80;

export interface StrengthRequest {
  id: number;
  build: DerivedInput;
}

export interface StrengthResult {
  id: number;
  runs: number;
  scenarios: { key: string; name: string; description: string }[];
  rivals: { key: string; name: string }[];
  /** points[s][r]: puntos contra el rival r en el escenario s (ganar 1, que nadie caiga 0,5). */
  points: number[][];
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<StrengthRequest>) => {
  const { id, build } = e.data;
  const points = runMatchups({ key: 'tu', name: 'Tu personaje', build }, ARCHETYPE_CONTENDERS, RUNS);
  const result: StrengthResult = {
    id,
    runs: RUNS,
    scenarios: SCENARIOS.map(({ key, name, description }) => ({ key, name, description })),
    rivals: ARCHETYPE_CONTENDERS.map(({ key, name }) => ({ key, name })),
    points,
  };
  ctx.postMessage(result);
};
