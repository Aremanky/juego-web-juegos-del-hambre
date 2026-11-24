/**
 * Banco de rendimiento del mapa (GDD §7): la partida real de MapCanvas con un mapa generado y participantes que
 * caminan, sin servidor. Parámetros en la URL: n (participantes, 24), caidos (8), noche, niebla, bocadillos,
 * ancho×alto lo pone el navegador. Lo usa `playwright.perf.config.ts`; `window.__cenizaPerf` recoge los tiempos.
 */
import { createRoot } from 'react-dom/client';
import { buildRoute, findPath, generateMap, tileAt, TERRAIN, type Cell } from '@ceniza/engine';
import { Rng, type ActorView } from '@ceniza/shared';
import { MapCanvas } from '../features/match/MapCanvas';
import { useMatch } from '../stores/match';
import '../styles/app.css';
import '../styles/match.css';

const q = new URLSearchParams(location.search);
const N = Number(q.get('n') ?? 24);
const DEAD = Number(q.get('caidos') ?? 8);
const SIZE = 96;
const map = generateMap('banco-del-mapa', SIZE);
const rng = new Rng('banco');
const walkable = (c: Cell) => {
  const t = tileAt(map, c.x, c.y);
  return t !== undefined && TERRAIN[t] !== undefined && TERRAIN[t].cost < 3;
};
const pick = (near: Cell, r: number): Cell => {
  for (let i = 0; i < 200; i++) {
    const c = { x: Math.round(near.x + rng.int(-r, r)), y: Math.round(near.y + rng.int(-r, r)) };
    if (c.x > 1 && c.y > 1 && c.x < SIZE - 2 && c.y < SIZE - 2 && walkable(c)) return c;
  }
  return { ...map.center };
};
const COLORS = ['#c0392b', '#2e86c1', '#d4ac0d', '#28b463', '#8e44ad', '#e67e22', '#16a085', '#7f8c8d'];
const actors: Record<string, ActorView> = {};
for (let i = 0; i < N; i++) {
  const from = pick(map.center, 9);
  const to = pick(from, 30);
  const path = findPath(map, from, to);
  const route = path && path.length > 1 ? buildRoute(map, from, path, 0, 1.3 + (i % 3) * 0.4) : null;
  const dead = i > 0 && i <= DEAD;
  actors[`a${i}`] = {
    id: `a${i}`,
    kind: i === 0 ? 'human' : 'bot',
    userId: i === 0 ? 'yo' : null,
    name: i === 0 ? 'Kael' : `Bot ${i}`,
    epithet: null,
    color: COLORS[i % COLORS.length],
    frame: 'sencillo',
    portrait: { kind: 'generated', seed: `banco-${i}` },
    look: null,
    district: (i % 12) + 1,
    gender: i % 2 ? 'F' : 'M',
    alive: !dead,
    place: dead ? N - i : null,
    cause: null,
    connected: true,
    control: i === 0 ? 'jugador' : 'piloto',
    seen: true,
    vision: i === 0 ? 7 : null,
    explored: i === 0 ? 1 : null,
    move: null,
    x: from.x,
    y: from.y,
    route: dead ? null : route,
  };
}
const night = q.has('noche');
// Bocadillos: cuatro bots hablan y se renuevan cada 4 s para que siempre haya alguno a la vista.
const talk = () => Object.fromEntries([9, 10, 11, 12].filter((i) => i < N).map((i) => [`a${i}`, { text: 'El Obelisco es mío. Apartaos.', at: Date.now() }]));
const speech = q.has('bocadillos') ? talk() : {};
if (q.has('bocadillos')) setInterval(() => useMatch.setState({ speech: talk() }), 4000);
useMatch.setState({
  matchId: 'banco',
  seed: 'banco-del-mapa',
  size: SIZE,
  tiles: map.tiles,
  heights: map.heights,
  pois: map.pois.map((p) => ({ ...p })),
  rivers: map.rivers.map((r) => r.flatMap((c) => [c.x, c.y])),
  roads: map.roads.map((r) => r.flatMap((c) => [c.x, c.y])),
  center: map.center,
  visibility: q.has('niebla') ? 'niebla' : 'visible',
  phase: 'en_curso',
  me: 'a0',
  actors,
  order: Object.keys(actors),
  clock: { t: 0, at: Date.now(), running: true },
  day: night ? { dayMs: 1000, nightMs: 1e9, startAt: -60_000 } : null,
  speech,
});
createRoot(document.getElementById('root')!).render(
  <div className="map-wrap" style={{ position: 'fixed', inset: 0 }}>
    <MapCanvas onCell={() => undefined} onActor={() => undefined} />
  </div>,
);
