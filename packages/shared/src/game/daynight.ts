/**
 * Ciclo de día y noche (GDD §3 y §4). El día empieza al acabar la cuenta atrás; de noche la visión
 * baja (×0,6 con las ventajas de cada personaje) y el sigilo sube. Lo calculan igual el servidor (para la
 * niebla) y el cliente (para pintar la noche y el reloj).
 */
export type Pace = 'rapida' | 'estandar' | 'larga' | 'ilimitada';

const MIN = 60_000;

/** Duración del día y de la noche por ritmo de partida (GDD §3). */
export const DAY_NIGHT_BY_PACE: Record<Pace, { dayMs: number; nightMs: number }> = {
  rapida: { dayMs: 4 * MIN, nightMs: 2 * MIN },
  estandar: { dayMs: 8 * MIN, nightMs: 4 * MIN },
  larga: { dayMs: 16 * MIN, nightMs: 8 * MIN },
  ilimitada: { dayMs: 20 * MIN, nightMs: 10 * MIN },
};

export interface DayCycle {
  dayMs: number;
  nightMs: number;
  /** Hora de juego en que empieza el primer día. */
  startAt: number;
}

export interface DayPhase {
  night: boolean;
  /** Número de día o de noche, desde 1. */
  index: number;
  /** Ms que faltan para el próximo cambio. */
  left: number;
  /** 0 de pleno día, 1 de plena noche, con 20 s de transición al anochecer y al amanecer. */
  darkness: number;
}

const DUSK_MS = 20_000;

export function dayPhase(t: number, c: DayCycle): DayPhase {
  const since = t - c.startAt;
  if (since < 0) return { night: false, index: 1, left: c.dayMs - since, darkness: 0 };
  const cycle = c.dayMs + c.nightMs;
  const n = Math.floor(since / cycle);
  const at = since - n * cycle;
  const night = at >= c.dayMs;
  const left = night ? cycle - at : c.dayMs - at;
  const dusk = Math.min(DUSK_MS, c.dayMs / 4, c.nightMs / 4);
  let darkness: number;
  if (!night) darkness = left < dusk ? 1 - left / dusk : 0;
  else darkness = left < dusk ? left / dusk : 1;
  return { night, index: n + 1, left, darkness };
}
