/** Datos de prueba compartidos por las pruebas del cliente (no se usan en la aplicación). */
import type { GameMap } from '@ceniza/engine';
import type { ActorView } from '@ceniza/shared';

/** Un participante visto, vivo y quieto en (10, 12); `over` cambia lo que haga falta. */
export function actorView(id: string, over: Partial<ActorView> = {}): ActorView {
  return {
    id,
    kind: 'bot',
    userId: null,
    name: id,
    epithet: null,
    color: '#8a7a5c',
    frame: 'sencillo',
    portrait: { kind: 'generated', seed: id },
    look: null,
    district: 1,
    gender: 'F',
    alive: true,
    place: null,
    cause: null,
    connected: true,
    control: 'jugador',
    seen: true,
    vision: null,
    explored: null,
    move: null,
    x: 10,
    y: 12,
    route: null,
    ...over,
  };
}

export const byId = (...actors: ActorView[]): Record<string, ActorView> => Object.fromEntries(actors.map((a) => [a.id, a]));

/** Mapa de pradera hecho a mano (id 1 = pradera), para rutas fáciles de calcular a mano. */
export const flatMap = (size: number): GameMap => ({ size, tiles: new Uint8Array(size * size).fill(1), heights: new Uint8Array(size * size), center: { x: 0, y: 0 }, pois: [], rivers: [], roads: [] });
