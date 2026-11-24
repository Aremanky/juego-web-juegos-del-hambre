/**
 * IA de los bots y del piloto automático (GDD §13, fase 6). Utility AI: cada bot puntúa las opciones que
 * tiene ahora mismo (0–1 por consideración, combinadas con compensación), suma un poco de inercia a lo
 * que ya hace y el ruido de su dificultad, y elige la mejor. Actúa con las mismas intenciones que un
 * humano (`moveIntent`), que el motor valida igual.
 *
 * Reglas de juego limpio: percibe exactamente lo que vería un humano en su asiento (misma visión por
 * terreno y noche, misma niebla), recuerda solo lo que ha visto y olvida según su dificultad. Las
 * estimaciones de combate usan el motor de combate real con un azar propio, para no tocar el del mundo.
 *
 * Hoy decide entre ir al Obelisco al empezar, explorar regiones, acechar a quien cree poder vencer, huir
 * de quien le supera, esconderse y esperar. Comer, beber, fabricar, aliarse o atacar llegan con los
 * sistemas de la fase 8, sobre esta misma estructura.
 */
import { ARCHETYPES, DIFFICULTIES, PERSONALITIES, PLAYSTYLES, Rng, hashString, TERRAIN_KINDS, TERRAIN_RULES, type BotActionKey, type DerivedInput, type DifficultyDef, type DifficultyKey, type PersonalityKey, type PersonalityWeights, type PlaystyleKey } from '@ceniza/shared';
import { SCENARIOS, type Contender } from './balance.js';
import { inBounds, regionAt, tileAt, type Cell } from './map.js';
import { T } from './terrain.js';
import { trySpeak, want } from './speech.js';
import { IntentError, actorById, moveIntent, positionAt, visionAt, type ActorState, type World, type WorldEvent } from './world.js';

export type BotAction = BotActionKey;

export const BOT_ACTION_LABEL: Record<BotAction, string> = {
  obelisco: 'va al Obelisco',
  explorar: 'explora',
  acechar: 'acecha',
  huir: 'huye',
  esconderse: 'busca dónde esconderse',
  esperar: 'espera',
};

export interface BotMind {
  action: BotAction;
  goal: Cell | null;
  targetId: string | null;
  since: number;
  /** Última posición vista de cada participante (memoria). */
  seen: Record<string, { x: number; y: number; t: number }>;
  /** Probabilidad estimada de ganar a cada uno, con su hora (caché de 30 s). */
  odds: Record<string, { p: number; t: number }>;
}

interface Option {
  action: BotAction;
  score: number;
  goal: Cell | null;
  targetId: string | null;
}

interface Seen {
  o: ActorState;
  pos: { x: number; y: number };
  dist: number;
}

const EARLY_MS = 60_000;
const ODDS_TTL_MS = 30_000;
const MAX_LEG = 40;
const ODDS_RUNS: Record<DifficultyKey, number> = { facil: 4, normal: 10, dificil: 20, experto: 30 };

/**
 * Simulaciones de combate como mucho por tick entre todos los bots. Al empezar, todos se ven en el anillo
 * y querrían estimar a la vez: con el presupuesto, lo que no cabe en un tick se afina en los siguientes.
 */
export const SIM_BUDGET_PER_TICK = 120;
/** Vida de una estimación provisional (sin presupuesto): se vuelve a intentar enseguida. */
const PROVISIONAL_TTL_MS = 2_000;

/** Contadores de la IA, para las pruebas y el diagnóstico. */
export const aiStats = { ticks: 0, maxSimsInTick: 0, provisional: 0 };

let simBudget = Number.POSITIVE_INFINITY;
let simsThisTick = 0;

/** Abre el presupuesto de simulaciones de un tick. Fuera de un tick no hay límite. */
export function beginTickBudget(): void {
  simBudget = SIM_BUDGET_PER_TICK;
  simsThisTick = 0;
}

export function endTickBudget(): void {
  aiStats.ticks++;
  if (simsThisTick > aiStats.maxSimsInTick) aiStats.maxSimsInTick = simsThisTick;
  simBudget = Number.POSITIVE_INFINITY;
  simsThisTick = 0;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Producto de consideraciones 0–1 con compensación (Dave Mark, GDC 2015): así añadir factores no hunde
 * todas las puntuaciones hacia 0, y un 0 sigue vetando.
 */
export function combine(factors: number[]): number {
  const mod = 1 - 1 / factors.length;
  let s = 1;
  for (const f of factors) {
    const v = clamp01(f);
    s *= v + (1 - v) * mod * v;
  }
  return s;
}

function gaussian(rng: Rng): number {
  const u = Math.max(1e-9, rng.next());
  const v = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const PILOT_PERSONALITY: Record<string, PersonalityKey> = { agresiva: 'agresivo', equilibrada: 'estratega', defensiva: 'cauteloso', huidiza: 'pacifico' };

export function personalityOf(a: ActorState): PersonalityKey {
  if (a.bot) return a.bot.personality;
  return PILOT_PERSONALITY[a.strategy?.combat ?? 'equilibrada'] ?? 'estratega';
}

export function difficultyOf(a: ActorState): DifficultyKey {
  return a.bot?.difficulty ?? 'normal';
}

/** Estilo de juego: el de un bot; el piloto automático de un humano juega equilibrado. */
export function playstyleOf(a: ActorState): PlaystyleKey {
  return a.bot?.playstyle ?? 'equilibrado';
}

const coverOf = (w: World, x: number, y: number) => TERRAIN_RULES[TERRAIN_KINDS[tileAt(w.map, x, y)] ?? 'pradera'].cover;
const walkable = (w: World, x: number, y: number) => inBounds(w.map, x, y) && tileAt(w.map, x, y) !== T.AGUA && tileAt(w.map, x, y) !== T.CUMBRE;

/** Lo que vería un humano en su asiento: con niebla, solo lo que cae dentro de su visión (GDD §7.4). */
export function perceive(w: World, a: ActorState): Seen[] {
  const me = positionAt(a, w.t);
  const fog = w.rules.visibility === 'niebla';
  const r = visionAt(w, a, me);
  const out: Seen[] = [];
  for (const o of w.actors) {
    if (o === a || !o.alive) continue;
    const pos = positionAt(o, w.t);
    const dist = Math.hypot(pos.x - me.x, pos.y - me.y);
    if (!fog || dist <= r) out.push({ o, pos, dist });
  }
  return out;
}

const PRESUMED = ARCHETYPES.find((x) => x.key === 'equilibrado')!;

/**
 * Lo que se sabe de la build de otro participante (GDD §7.4: nada que no percibiría un humano). La de un
 * bot es pública, porque cualquiera la ve y la edita en el lobby. La de un humano es secreta, así que se
 * supone la media (Equilibrado) con su distrito, que sí se ve. Afinarla al verle pelear llega con el
 * combate de la fase 8. Puede faltar en bots de partidas guardadas por la 0.5.
 */
export function knownBuild(o: ActorState): DerivedInput | undefined {
  if (o.kind === 'bot') return o.build;
  return { attributes: PRESUMED.attributes, abilities: PRESUMED.abilities, trait: PRESUMED.trait, defect: null, district: o.district };
}

/** Probabilidad de ganar a `o`: simulaciones con el motor de combate real, más el error de su dificultad. */
export function estimateOdds(w: World, a: ActorState, o: ActorState, diff: DifficultyDef): number {
  const mind = a.mind!;
  const cached = mind.odds[o.id];
  // Caducidad escalonada por pareja: si todas caducasen a la vez, el servidor tendría picos.
  const ttl = ODDS_TTL_MS + (hashString(a.id + ':' + o.id) % 15_000);
  if (cached && w.t - cached.t < ttl) return cached.p;
  let p = 0.5;
  const theirs = knownBuild(o);
  if (a.build && theirs) {
    const key = difficultyOf(a);
    const runs = ODDS_RUNS[key];
    if (runs > simBudget) {
      // Sin presupuesto en este tick: vale la estimación anterior (o la neutra) durante un momento.
      aiStats.provisional++;
      const prev = cached ? cached.p : 0.5;
      mind.odds[o.id] = { p: prev, t: w.t - ttl + PROVISIONAL_TTL_MS };
      return prev;
    }
    simBudget -= runs;
    simsThisTick += runs;
    const terrainAware = key === 'experto' || key === 'dificil';
    const there = positionAt(o, w.t);
    const covered = coverOf(w, Math.round(there.x), Math.round(there.y)) >= 6;
    const scenario = SCENARIOS.find((s) => s.key === (terrainAware && covered ? 'emboscada' : 'abierto')) ?? SCENARIOS[0];
    const me: Contender = { key: a.id, name: a.name, build: a.build };
    const them: Contender = { key: o.id, name: o.name, build: theirs };
    const rng = new Rng(`probabilidades:${w.seed}:${a.id}:${o.id}:${Math.floor(w.t / ODDS_TTL_MS)}`);
    let points = 0;
    for (let i = 0; i < runs; i++) {
      const swap = i % 2 === 1;
      const r = swap ? scenario.run(them, me, rng) : scenario.run(me, them, rng);
      if (r === null) points += 0.5;
      else if ((r === 0) !== swap) points += 1;
    }
    p = clamp01(points / runs + gaussian(rng) * diff.combatEstimateNoise);
  }
  mind.odds[o.id] = { p, t: w.t };
  return p;
}

/** Casilla transitable más cercana a (x, y), buscando en espiral hasta `radius`. */
function nearestWalkable(w: World, x: number, y: number, radius = 6): Cell | null {
  const cx = Math.round(x);
  const cy = Math.round(y);
  for (let r = 0; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (walkable(w, cx + dx, cy + dy)) return { x: cx + dx, y: cy + dy };
      }
    }
  }
  return null;
}

/** La casilla con más cobertura a menos de `radius`, la más cercana si empatan. */
function nearestCover(w: World, me: Cell, radius = 10): Cell | null {
  let best: Cell | null = null;
  let bestScore = -Infinity;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = me.x + dx;
      const y = me.y + dy;
      if (!walkable(w, x, y)) continue;
      const cover = coverOf(w, x, y);
      if (cover < 5) continue;
      const s = cover - Math.hypot(dx, dy) * 0.6;
      if (s > bestScore) {
        bestScore = s;
        best = { x, y };
      }
    }
  }
  return best;
}

/** A dónde huir: lejos de la amenaza, prefiriendo casillas con cobertura. */
function fleeGoal(w: World, me: Cell, threat: { x: number; y: number }): Cell | null {
  const away = Math.atan2(me.y - threat.y, me.x - threat.x);
  let best: Cell | null = null;
  let bestScore = -Infinity;
  for (let k = -3; k <= 3; k++) {
    const ang = away + (k * Math.PI) / 9;
    for (const d of [7, 11]) {
      const c = nearestWalkable(w, me.x + Math.cos(ang) * d, me.y + Math.sin(ang) * d, 2);
      if (!c) continue;
      const s = Math.hypot(c.x - threat.x, c.y - threat.y) + coverOf(w, c.x, c.y) * 0.4 - Math.abs(k) * 0.5;
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
  }
  return best;
}

function scoreOptions(w: World, a: ActorState, mind: BotMind, pers: PersonalityWeights, diff: DifficultyDef, me: Cell, seen: Seen[], protectedMode: boolean): Option[] {
  const opts: Option[] = [];
  const vision = Math.max(1, visionAt(w, a, me));
  const night = !!w.night;
  const here = coverOf(w, me.x, me.y);
  const startAt = w.rules.presentationMs + w.rules.countdownMs;

  // Amenaza y presa a la vista.
  let threat: { s: Seen; v: number } | null = null;
  let prey: { s: Seen; v: number; p: number } | null = null;
  // Solo cuentan los cuatro más cercanos que estén a tiro: en modo visible se ve a todos, pero quien
  // está al otro lado del mapa no cambia nada ahora (y así no se simulan combates de más).
  const near4 = seen.filter((s) => s.dist <= vision * 1.5).sort((x, y) => x.dist - y.dist).slice(0, 4);
  for (const s of near4) {
    const p = estimateOdds(w, a, s.o, diff);
    const near = clamp01(1 - s.dist / (vision * 1.5));
    // Solo amenaza quien probablemente le gana; a quien cree vencer no le teme. Curvas: un 25 % de
    // ventaja ya es una presa clara, y un 30 % de desventaja, una amenaza clara.
    const t = clamp01((0.55 - p) / 0.3) * near;
    if (!threat || t > threat.v) threat = { s, v: t };
    const pr = clamp01((p - 0.5) / 0.25) * near;
    if (!prey || pr > prey.v) prey = { s, v: pr, p };
  }
  const danger = threat ? threat.v : 0;

  if (threat && threat.v > 0.05) {
    const goal = fleeGoal(w, me, threat.s.pos);
    if (goal) opts.push({ action: 'huir', score: combine([threat.v * 1.6, 0.35 + pers.caution * 0.65]), goal, targetId: threat.s.o.id });
  }
  if (!protectedMode) {
    if (w.t - startAt < EARLY_MS) {
      const early = 1 - (w.t - startAt) / EARLY_MS;
      const goal = nearestWalkable(w, w.map.center.x + w.rng.int(-2, 2), w.map.center.y + w.rng.int(-2, 2));
      if (goal) opts.push({ action: 'obelisco', score: combine([pers.aggression * 0.55 + pers.greed * 0.55, 1 - pers.caution * 0.75, early]) * 0.95, goal, targetId: null });
    }
    if (prey && prey.v > 0.05) {
      const t = prey.s.pos;
      const ang = Math.atan2(me.y - t.y, me.x - t.x);
      const goal = nearestWalkable(w, t.x + Math.cos(ang) * 2, t.y + Math.sin(ang) * 2, 2);
      if (goal) opts.push({ action: 'acechar', score: combine([prey.v * 1.4, 0.25 + pers.aggression * 0.75, 1 - danger]), goal, targetId: prey.s.o.id });
    }
    const unexplored = w.map.pois.filter((p) => !(a.explored & (1 << p.id)));
    if (unexplored.length) {
      let best = unexplored[0];
      for (const p of unexplored) if (Math.hypot(p.x - me.x, p.y - me.y) < Math.hypot(best.x - me.x, best.y - me.y)) best = p;
      const goal = nearestWalkable(w, best.x, best.y);
      if (goal) opts.push({ action: 'explorar', score: combine([0.35 + pers.curiosity * 0.65, 1 - danger, night ? 0.6 : 1]) * 0.8, goal, targetId: null });
    } else {
      const goal = nearestWalkable(w, me.x + w.rng.int(-12, 12), me.y + w.rng.int(-12, 12));
      if (goal) opts.push({ action: 'explorar', score: combine([0.2 + pers.curiosity * 0.4, 1 - danger]) * 0.5, goal, targetId: null });
    }
  }
  if (here < 5) {
    const goal = nearestCover(w, me);
    const need = (protectedMode ? 0.8 : 0.15) + (night ? 0.25 : 0) + (seen.length ? 0.2 : 0);
    if (goal) opts.push({ action: 'esconderse', score: combine([need, 0.3 + pers.caution * 0.7]), goal, targetId: null });
  }
  opts.push({ action: 'esperar', score: 0.1 + (here >= 5 ? pers.caution * 0.3 + (protectedMode ? 0.5 : 0) : 0), goal: null, targetId: null });
  // El estilo de juego modula los pesos: el cazador acecha más, el superviviente se esconde más…
  const bias = PLAYSTYLES[playstyleOf(a)].actionBias;
  for (const o of opts) o.score *= bias[o.action] ?? 1;
  return opts;
}

/** Acerca el destino si queda lejos: tramos de 40 casillas como mucho, para rutas cortas y baratas. */
function leg(w: World, me: Cell, goal: Cell): Cell | null {
  const d = Math.max(Math.abs(goal.x - me.x), Math.abs(goal.y - me.y));
  if (d <= MAX_LEG) return goal;
  const k = MAX_LEG / d;
  return nearestWalkable(w, me.x + (goal.x - me.x) * k, me.y + (goal.y - me.y) * k);
}

/**
 * Un ciclo de decisión. Lo llama el motor cuando le toca pensar (según su dificultad). Devuelve lo que
 * dice el bot en este ciclo, si dice algo: acechar o huir de alguien nuevo puede arrancarle una frase.
 */
export function think(w: World, a: ActorState): WorldEvent[] {
  const before = a.mind ? { action: a.mind.action, targetId: a.mind.targetId } : null;
  decide(w, a);
  const m = a.mind!;
  if (m.targetId && (before?.action !== m.action || before?.targetId !== m.targetId)) {
    if (m.action === 'acechar') want(w, a, 'acecho', m.targetId);
    else if (m.action === 'huir') want(w, a, 'huida', m.targetId);
  }
  const said = trySpeak(w, a);
  return said ? [said] : [];
}

/** Elige qué hacer y da la orden (la misma intención que daría un humano). */
function decide(w: World, a: ActorState): void {
  const diff = DIFFICULTIES[difficultyOf(a)];
  const pers = PERSONALITIES[personalityOf(a)].weights;
  const mind = (a.mind ??= { action: 'esperar', goal: null, targetId: null, since: w.t, seen: {}, odds: {} });
  a.nextThinkAt = w.t + diff.thinkIntervalMs + w.rng.int(0, 250);
  const pos = positionAt(a, w.t);
  const me = { x: Math.round(pos.x), y: Math.round(pos.y) };

  const seen = perceive(w, a);
  for (const s of seen) mind.seen[s.o.id] = { x: s.pos.x, y: s.pos.y, t: w.t };
  for (const id of Object.keys(mind.seen)) {
    if (w.t - mind.seen[id].t > diff.memoryMs || !actorById(w, id)?.alive) delete mind.seen[id];
  }

  const options = scoreOptions(w, a, mind, pers, diff, me, seen, a.control === 'protegido');
  let best: (Option & { s: number }) | null = null;
  for (const o of options) {
    if (o.score <= 0) continue;
    // Ruido de la dificultad (y del azar de la personalidad) y un poco de inercia para no dudar.
    let s = o.score + gaussian(w.rng) * diff.decisionNoise * (0.6 + pers.randomness * 0.8) * 0.5;
    if (o.action === mind.action) s += 0.05;
    if (!best || s > best.s) best = { ...o, s };
  }
  if (!best) return;

  const changed = best.action !== mind.action || best.targetId !== mind.targetId;
  if (changed) mind.since = w.t;
  mind.action = best.action;
  mind.targetId = best.targetId;
  mind.goal = best.goal;
  if (!best.goal) return;

  // Solo se da una orden nueva si cambia el plan, el destino se ha movido o ya llegó.
  const routeGoal = a.route ? { x: a.route.cells[a.route.cells.length - 2], y: a.route.cells[a.route.cells.length - 1] } : null;
  const target = leg(w, me, best.goal);
  if (!target || (target.x === me.x && target.y === me.y)) return;
  if (!changed && routeGoal && Math.hypot(routeGoal.x - target.x, routeGoal.y - target.y) < 2.5) return;
  try {
    moveIntent(w, a.id, target);
  } catch (e) {
    if (!(e instanceof IntentError)) throw e;
    mind.goal = null; // sin camino: se replantea en el siguiente ciclo
  }
}

/** Región en la que está (para explorar). */
export function regionOf(w: World, a: ActorState): number {
  const p = positionAt(a, w.t);
  return regionAt(w.map, p.x, p.y);
}
