# Cierre de la fase 7 — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar la fase 7 con lo que no depende de otras fases: personajes en cinco direcciones con trepar y caer, tarjeta del participante, ruta y tiempo antes de ir, «visto por última vez» y la decisión medida sobre PixiJS.

**Architecture:** Una función pura del motor (`planRoute`) calcula la ruta para el servidor y para la vista previa del cliente. La lógica nueva del cliente va en funciones puras con pruebas (rumbo, toque, vista, vista previa, tarjeta); `MapCanvas`, la tienda y `MatchPage` solo las conectan. La figura gana dos vistas de 3/4 y las posturas de trepar y caer.

**Tech Stack:** TypeScript, motor puro (`packages/engine`), React 19 + canvas 2D (`apps/web`), vitest (aquí con el arnés `tsx /home/claude/harness/run.mjs`), Playwright + Chromium sin GPU para capturas y medidas.

**Spec:** `docs/superpowers/specs/2026-11-24-fase-7-cierre-design.md`

## Global Constraints

- Textos de interfaz en español, sin exclamaciones ni cursivas; letra de 12 px o más; contraste de 4,5:1 o más; objetivos táctiles de 44 px o más; sin franjas laterales de color; sombras al sureste (luz del noroeste).
- Nada de lo nuevo enseña lo que el jugador no ha visto: ni posición actual de quien no ve, ni build, ni salud.
- La vista previa usa `planRoute`, la misma función que `moveIntent`.
- En escritorio, moverse sigue siendo un clic.
- Sin commits salvo que Andrés lo pida: se trabaja en `fase-6-cierre`, encima de la fase 6 sin confirmar.
- Pruebas: `tsx /home/claude/harness/run.mjs <archivos>`; `tsc -p packages/{shared,engine}/tsconfig.json`; tipos del servidor y la web con los `tsconfig` de módulos vacíos de `/home/claude/scratch` (base: 41 y 9 errores, ninguno en archivos tocados).
- Versión 0.6.3.

## Review Focus

1. Portátiles táctiles: ratón y dedo en el mismo equipo. Lo decide el `pointerType` de cada evento; con el dedo nunca hay vista previa por «pasar por encima».
2. La ruta propia cambia mientras hay vista previa (el servidor la corrige, llega a destino o el jugador para): la vista previa se recalcula con la ruta nueva, nunca con la vieja.
3. Tarjeta abierta de alguien que cae, deja de verse o vuelve a verse: se actualiza sin cerrarse ni romperse.
4. Marcas de «visto por última vez» cuando el propio jugador cae (con niebla, ya lo ve todo) o cambia de partida: no quedan marcas viejas.
5. Botón «Ir» en móviles con muesca y con los avisos de abajo: se ve entero, no lo tapa nada y respeta la zona segura.

Las líneas 2, 3 y 4 tienen prueba en la Task 2 (`previewFor`, `participantCard`, `trackSight`); la 1 y la 5 se comprueban en la Task 7.

---

### Task 1: Motor — `planRoute` y `move` en la vista propia

**Files:**
- Modify: `packages/engine/src/world.ts` (exporta `planRoute`; `moveIntent` la usa; `toView` añade `move`)
- Modify: `packages/shared/src/schemas/match.ts` (`ActorView.move`)
- Create: `packages/engine/src/plan.test.ts`
- Modify: `apps/server/test/arena.test.ts` (prueba escrita; se ejecuta fuera de aquí)

**Interfaces:**
- Produces:
  ```ts
  export type PlanResult = { ok: true; route: Route | null; arrival: number } | { ok: false; error: string };
  export function planRoute(map: GameMap, from: { x: number; y: number; route: Route | null }, to: Cell, t: number, speed: number, costs?: readonly number[]): PlanResult;
  // ActorView (shared):
  move?: { speed: number; costs: number[] } | null; // solo el propio personaje
  ```

- [ ] **Step 1: Escribe las pruebas** en `plan.test.ts` (mundo como en `speech.test.ts`: `createWorld` + ticks hasta `en_curso`):
  - `planRoute da la misma ruta que moveIntent, parado y a mitad de camino`: con un humano parado, `planRoute(w.map, a, to, w.t, a.speed, a.costs)` y luego `moveIntent(w, a.id, to)`: `expect(r).toEqual({ ok: true, route: a.route, arrival: routeEndTime(a.route!) })`. Después avanza 1,5 s con `tick` y repite con otro destino.
  - `planRoute da los mismos errores`: fuera del mapa → `'Ese destino está fuera de la arena'`; con costes todo `Infinity` → `'No hay camino hasta ahí'`; de una esquina a la opuesta en un mapa de 128 → `'Demasiado lejos para una sola orden: elige un punto más cercano'`.
  - `hasta la casilla siguiente, para allí`: a mitad de un paso, con `to` igual a `nextStop(...).cell`: `route` es `truncateAfterCurrent(...)` (o `null` si se queda en una casilla) y `arrival` es `nextStop(...).time`.
  - `la vista propia lleva velocidad y costes; la de los demás no`: `computeView(w, 'u-yo')` → `move` igual a `{ speed: a.speed, costs: a.costs }` para el propio y `null` para el resto.
- [ ] **Step 2: Ejecuta y comprueba que fallan.** `tsx /home/claude/harness/run.mjs packages/engine/src/plan.test.ts` → falla porque `planRoute` no existe.
- [ ] **Step 3: Implementa** `planRoute` en `world.ts` sacando la lógica de `moveIntent` (sin cambiarla: `nextStop`, `truncateAfterCurrent`, `findPath` con `costs`, `MAX_ROUTE_CELLS`, `buildRoute`, `concat`). `moveIntent` = `requireActive` + `planRoute` + `IntentError(error)` + asignar la ruta (y `x`, `y` si no tenía ruta y la hay nueva). `toView` añade `move: self ? { speed: a.speed, costs: a.costs } : null`.
- [ ] **Step 4: Ejecuta las pruebas del motor completas.** `tsx /home/claude/harness/run.mjs packages/engine/src/*.test.ts` → todas pasan; el hash de `baseline.ts` (mundo y equilibrio) no cambia.
- [ ] **Step 5: Prueba del servidor** en `arena.test.ts`: `la instantánea lleva move solo para el propio jugador` (escrita, sin ejecutar aquí).
- [ ] **Step 6: Punto de control** (sin commit).

### Task 2: Cliente — funciones puras con pruebas

**Files:**
- Create: `apps/web/src/features/match/facing.ts`, `pick.ts`, `plan.ts`, `card.ts` y sus `*.test.ts`
- Create: `apps/web/src/stores/sight.ts` y `sight.test.ts`

**Interfaces:**
- Consumes: `planRoute`, `PlanResult` (Task 1); `PERSONALITIES`, `DIFFICULTIES`, `ActorView`, `BotSettings` (shared).
- Produces:
  ```ts
  // facing.ts
  export type Facing = 'S' | 'SE' | 'E' | 'NE' | 'N' | 'NW' | 'W' | 'SW';
  export function facingOf(dx: number, dy: number, prev: Facing): Facing;
  // pick.ts — cajas en orden de dibujo (la última, delante)
  export interface HitBox { id: string; x: number; top: number; bottom: number; half: number }
  export function pickActor(boxes: readonly HitBox[], px: number, py: number, slop: number): string | null;
  // sight.ts
  export interface LastSeen { x: number; y: number; at: number }
  export function trackSight(prev: Readonly<Record<string, LastSeen>>, before: Readonly<Record<string, ActorView>>, after: Readonly<Record<string, ActorView>>, at: number, posOf: (a: ActorView) => { x: number; y: number }): Record<string, LastSeen>;
  export function trackFalls(prev: Readonly<Record<string, number>>, before: Readonly<Record<string, ActorView>>, after: Readonly<Record<string, ActorView>>, at: number): Record<string, number>;
  // plan.ts
  export function formatDuration(ms: number): string; // «25 s», «1 min 20 s», «2 min»
  export function formatEta(ms: number): string; // «≈ 25 s»
  export type Preview = { x: number; y: number; route: RouteDTO | null; eta: number; cells: number; error: null } | { x: number; y: number; route: null; eta: null; cells: null; error: string };
  export function previewFor(map: GameMap, me: ActorView | null, to: Cell, now: number): Preview | null;
  export const TAP_PREVIEW_MS = 8_000;
  export type TapState = { cell: Cell; at: number } | null;
  export type TapEvent = { type: 'tap'; cell: Cell; at: number } | { type: 'tick'; at: number } | { type: 'go' } | { type: 'cancel' };
  export function tapPreview(s: TapState, e: TapEvent): { state: TapState; go: Cell | null };
  // card.ts
  export function statusText(a: ActorView, me: string | null): string; // movido de MatchPage, igual
  export interface CardInfo { kind: 'Humano' | 'Bot'; bot: string | null; status: string; where: string | null }
  export function participantCard(a: ActorView, ctx: { me: string | null; lastSeen?: LastSeen; now: number; bot: BotSettings | null; trip: { cells: number; eta: number } | null }): CardInfo;
  ```

- [ ] **Step 1: Escribe las pruebas** (valores exactos):
  - `facingOf`: (1,0) E; (1,1) SE; (0,1) S; (−1,1) SW; (−1,0) W; (−1,−1) NW; (0,−1) N; (1,−1) NE; (1,0,3) E; (1,0,5) SE; (0,0, prev NE) NE.
  - `pickActor`: un punto dentro de una caja da su id; dentro de dos que se solapan, la última; a 10 px fuera con `slop` 12, la encuentra; con `slop` 4, `null`.
  - `trackSight`: visto → no visto guarda `posOf(antes)` con `at`; no visto → visto lo borra; vivo → caído lo borra; sin cambios conserva la marca; si todos pasan a vistos (el propio cae y ya ve todo), queda vacío; quien no estaba en `before` y no se ve no deja marca.
  - `trackFalls`: vivo → caído guarda `at`; caído → caído lo conserva; quien llega ya caído (no estaba en `before`) no se anima.
  - `formatDuration`/`formatEta`: 400 → «≈ 1 s»; 25 000 → «≈ 25 s»; 59 600 → «≈ 1 min»; 80 000 → «≈ 1 min 20 s»; 120 000 → «≈ 2 min».
  - `previewFor`: con `me.move` da la ruta y `eta = arrival − now` de `planRoute`, y `cells` = casillas de la ruta nueva; errores con su texto; con `me` nulo, caído o sin `move`, `null`; con la ruta propia cambiada da otra llegada (foco de revisión 2).
  - `tapPreview`: primer toque guarda; segundo en la misma casilla va y limpia; en otra mueve; `tick` pasado `TAP_PREVIEW_MS` limpia; `go` va a la guardada; `cancel` limpia; tocar la misma casilla ya caducada es un primer toque.
  - `participantCard`: bot con ajustes → `kind: 'Bot'`, `bot: 'Agresivo · Normal'`; visto con `trip` → `where: 'A 12 casillas · ≈ 25 s'`; no visto con marca de hace 80 s → `'Visto por última vez hace 1 min 20 s'`; no visto sin marca → `'Aún no lo has visto'`; el propio → `status: 'Tú'`, `where: null`; caído → `where: null`; pasar de visto a caído con la tarjeta abierta no rompe (foco 3).
- [ ] **Step 2: Ejecuta y comprueba que fallan** (módulos inexistentes).
- [ ] **Step 3: Implementa** los cinco módulos. `previewFor` construye la ruta desde `me.route` (o `{x, y}` si no hay) con `gameNow` del llamador; `participantCard` usa `formatDuration`.
- [ ] **Step 4: Ejecuta** `tsx /home/claude/harness/run.mjs apps/web/src/**/*.test.ts` → todas pasan.
- [ ] **Step 5: Punto de control.**

### Task 3: Figura — ocho rumbos con dos vistas de 3/4

**Files:**
- Modify: `apps/web/src/features/match/figure.ts` (vistas `front34` y `back34`; `Facing` de `facing.ts`)
- Create: `apps/web/src/features/match/figure.test.ts`

**Interfaces:**
- Consumes: `Facing` (Task 2).
- Produces: `drawFigure(g, look, x, y, h, pose)` con `pose.facing: Facing` de ocho rumbos. Vistas: S frente, SE `front34`, E lado, NE `back34`, N espalda; SW, W y NW en espejo.

- [ ] **Step 1: Escribe las pruebas** con un contexto que graba las llamadas (`Proxy` que anota cada método y asignación):
  - `SW es SE en espejo, W es E y NW es NE`: las llamadas de SW son las de SE más un `scale(-1, 1)`.
  - `las vistas de 3/4 no son ni de frente ni de lado`: SE ≠ S, SE ≠ E, NE ≠ N.
- [ ] **Step 2: Ejecuta y comprueba que fallan.**
- [ ] **Step 3: Implementa** las dos vistas en cada pieza (torso, cabeza y cara, pelo, brazos, piernas, mochila, carcaj, capa y bufanda), con las reglas del spec §1 y la misma luz, contorno y paleta.
- [ ] **Step 4: Ejecuta** las pruebas de la figura → pasan.
- [ ] **Step 5: Punto de control.** (La comprobación visual va en la Task 7, junto con el resto.)

### Task 4: Figura — trepar y caer

**Files:**
- Modify: `apps/web/src/features/match/figure.ts`, `figure.test.ts`

**Interfaces:**
- Produces: `Pose.climbing: boolean` y `Pose.fall?: number` (0–1, solo con `dead: true`; sin él, caído quieto).

- [ ] **Step 1: Escribe las pruebas:**
  - `la caída acaba en la postura de caído`: `{ dead: true, fall: 1 }` graba lo mismo que `{ dead: true }`.
  - `la caída empieza de pie`: `{ dead: true, fall: 0 }` graba lo mismo que de pie quieto con el mismo `t`.
  - `trepar no es andar`: andando con `climbing: true` ≠ andando sin él.
- [ ] **Step 2: Ejecuta y comprueba que fallan.**
- [ ] **Step 3: Implementa** trepar (inclinado, brazos que se alternan hacia arriba, zancada corta) y la caída (rodillas que ceden, torso que se ladea y giro hasta la postura de caído, con suavizado).
- [ ] **Step 4: Ejecuta** las pruebas → pasan.
- [ ] **Step 5: Punto de control.**

### Task 5: Mapa y tienda — rumbos, trepar, caer, marcas y vista previa

**Files:**
- Modify: `apps/web/src/stores/match.ts` (`lastSeen`, `fellAt` con `trackSight` y `trackFalls`; se vacían al cambiar de partida)
- Modify: `apps/web/src/features/match/MapCanvas.tsx`
- Modify: `apps/web/src/features/match/MatchPage.tsx` (botón «Ir» táctil, texto de ayuda, `onActor`)
- Modify: `apps/web/src/styles/match.css`

**Interfaces:**
- Consumes: todo lo de las Tasks 2–4.
- Produces:
  ```ts
  // MapCanvas
  props: { onCell(x, y): void; onActor?(id: string): void; onPreview?(p: Preview | null): void; apiRef? }
  MapApi.clearPreview(): void
  ```

- [ ] **Step 1: Tienda.** En cada fotograma e instantánea de la misma partida, `lastSeen = trackSight(...)` con la posición interpolada a `gameNow()` y `fellAt = trackFalls(...)` con `Date.now()`; en otra partida, vacíos.
- [ ] **Step 2: Mapa.** Rumbo con `facingOf`; `climbing` en montaña y cumbre si se mueve y no nada; `fall` con `fellAt` (700 ms, sin animación con «reducir movimiento»); marcas de «visto por última vez» (anillo discontinuo de su color, nombre apagado y «hace 1 min», atenuadas con el tiempo; en el holograma, en turquesa); cajas de toque de personajes y marcas en orden de dibujo.
- [ ] **Step 3: Entrada.** Por `pointerType`:
  - ratón: al moverse sin botones, vista previa de la casilla (una vez por casilla y cada vez que cambie la ruta propia); el clic sobre un personaje o una marca abre su tarjeta (`onActor`) y en otro sitio va (`onCell`); cursor de mano sobre personajes;
  - táctil: toque sobre personaje o marca → `onActor`; en otro sitio, `tapPreview` (`onPreview` al cambiar); arrastrar o pellizcar no toca nada.
  Dibujo de la vista previa: discontinua más tenue que la ruta real, anillo en el destino y el tiempo con halo junto a él; con error, el texto del error.
- [ ] **Step 4: Página.** Con vista previa táctil, barra abajo con «Ir · ≈ 1 min 20 s» (botón de 44 px) y cerrar; con error, el texto. Zona segura (`env(safe-area-inset-bottom)`). Texto de ayuda según el dispositivo: «Pasa el ratón para ver la ruta y el tiempo; haz clic para ir.» / «Toca una casilla para ver la ruta; vuelve a tocarla para ir.»
- [ ] **Step 5: Tipos** de la web con el `tsconfig` de módulos vacíos → los mismos 9 errores de base.
- [ ] **Step 6: Punto de control.**

### Task 6: Tarjeta del participante

**Files:**
- Create: `apps/web/src/features/match/ParticipantCard.tsx`
- Modify: `MatchPage.tsx` (abrir desde el mapa y desde «Participantes»; `statusText` desde `card.ts`), `match.css`

**Interfaces:**
- Consumes: `participantCard`, `previewFor`, `lastSeen` de la tienda, `lobby.participants[].bot`.

- [ ] **Step 1: Componente.** Diálogo (`role="dialog"`, `aria-labelledby` con el nombre). Camafeo, nombre y epíteto, distrito, humano o bot (con personalidad y dificultad), estado y `where`. Botón «Ir hacia aquí» si se puede actuar y no es uno mismo: va a su casilla si se ve, o a la marca. Cerrar con el botón, Esc o tocando fuera; el foco va al botón de cerrar y vuelve al cerrar. Escritorio: junto al personaje sin salirse de la pantalla; móvil (ancho < 720 px): hoja inferior con zona segura.
- [ ] **Step 2: Conexiones.** `onActor` del mapa y clic en la fila de «Participantes». La tarjeta se actualiza en vivo (cae, deja de verse, vuelve a verse).
- [ ] **Step 3: Tipos** de la web → los mismos 9 errores.
- [ ] **Step 4: Punto de control.**

### Task 7: Comprobación visual (como mucho dos rondas)

**Files:** banco en `.superpowers/sdd/2026-11-24-fase-7-cierre/visual/` (fuera de git).

- [ ] **Step 1: Banco.** Página con el mapa real (esbuild) y Playwright a 1280×720 y 390×844:
  - ocho rumbos en reposo, andando, corriendo y trepando, a 64 y 32 px;
  - secuencia de caída;
  - vista previa con tiempo y marcas de «visto por última vez», de día, de noche y en holograma;
  - tarjeta y barra «Ir» en una página estática con el CSS real (escritorio y móvil, con muesca simulada).
- [ ] **Step 2: Revisa** con el suelo de oficio de Impeccable, `ui-design-review:review` y `design:accessibility-review`; corrige todo en un lote; una segunda ronda solo para confirmar.

### Task 8: PixiJS — medir y decidir

**Files:** banco en el espacio de trabajo; la decisión va a la Task 9.

- [ ] **Step 1: Banco de rendimiento.** Mapa real con bloques, objetos, 24 personajes moviéndose, rótulos, bocadillos y noche. Chrome sin GPU, 390×844 con densidad 3 y 1280×720; sin freno y con freno de CPU ×4 y ×6 (`Emulation.setCPUThrottlingRate`). 10 s por caso: media, p95 y fps.
- [ ] **Step 2: Decide** con el criterio del spec (≥ 30 fps con ×4 → canvas 2D). Si no llega, abarata (densidad máxima en móviles, sombras) y vuelve a medir; PixiJS solo si sigue sin llegar.

### Task 9: Documentos, versión, verificación y entrega

**Files:** `docs/GDD.md` (§5.9, §7.4, §7.5, §18), `docs/ARCHITECTURE.md`, `PROJECT_STATUS.md`, 5 `package.json`, `package-lock.json` (solo las entradas del proyecto), `APP_VERSION`.

- [ ] **Step 1: Documentos** con lo hecho, la decisión de PixiJS con sus medidas y criterio, y lo de las fases 8 y 9 en sus listas. Fase 7 al 100 %.
- [ ] **Step 2: Versión 0.6.3.**
- [ ] **Step 3: Verificación final:** todas las pruebas (shared, engine, web); `tsc` de shared y engine; tipos del servidor y la web con módulos vacíos; `baseline.ts` (hashes sin cambios).
- [ ] **Step 4: Revisión de la rama** con `superpowers:requesting-code-review` (hecha por mí; se dice en la entrega).
- [ ] **Step 5: Entrega:** parche solo de la fase 7 (sobre la fase 6) y parche total, capturas y resumen. Se sube a GitHub solo si Andrés lo pide.
