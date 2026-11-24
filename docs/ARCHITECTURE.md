# Arquitectura técnica

> Fases 2–5 · Estado: implementada y probada para usuarios, fotos, personajes, salas, lobby, el motor de partida
> en tiempo real (inicio, sincronización, movimiento, pausa por votación, desconexiones y reinicios) y la capa de
> reglas de la fase 5 (efectos según la situación, combate por rondas, detección y simulador de equilibrio).
> Mapa ilustrado con personajes animados, inventario, eventos e IA de bots se añaden en las fases 6–10.

## Visión general

```
 Navegador (móvil u ordenador)                       VM Ubuntu 24.04 (Proxmox)
┌──────────────────────────────┐   HTTPS / WSS   ┌──────────────────────────────────────────────┐
│ React 19 + Vite (SPA)        │ ◄─────────────► │ cloudflared (túnel)  ó  Caddy (HTTPS)        │
│  · React Query (REST)        │                 │            │ http://127.0.0.1:3000           │
│  · Zustand (estado de sala)  │                 │ ┌──────────▼─────────────────────────────┐   │
│  · socket.io-client          │                 │ │ Node 22 · Fastify 5 · Socket.IO 4      │   │
│  · Canvas 2D (fase 7: PixiJS)│                 │ │  REST: auth, fotos, plantillas, salas  │   │
│  · (fase 10) ONNX/WebGPU     │                 │ │  Tiempo real: lobby, chat y partida    │   │
└──────────────────────────────┘                 │ │  RoomManager → RoomRuntime → Match     │   │
                                                 │ └───────┬───────────────────────┬────────┘   │
                                                 │   PostgreSQL 16           /var/lib/ceniza    │
                                                 │   (Drizzle ORM)           (fotos en disco)   │
                                                 └──────────────────────────────────────────────┘
```

**Principio rector: el servidor es la autoridad.** El cliente solo envía *intenciones*; el servidor valida
(esquemas zod compartidos), decide, persiste y difunde. Ningún dato de salud, recursos, posición o resultado
se acepta desde el navegador.

## Monorepo (npm workspaces)

| Paquete | Contenido |
|---|---|
| `packages/shared` | Reglas del juego y contratos: atributos y fórmulas (`derived.ts`), habilidades, rasgos, defectos, distritos, arquetipos, personalidades/dificultades de bots, fábrica de bots, generador de retratos SVG, PRNG serializable, esquemas zod de API/sockets y tipos del estado del lobby. Desde la fase 5 también: terrenos (`terrain.ts`), armas y protecciones (`items.ts`), efectos según la situación (`situational.ts`) y el desglose de cada estadística (`breakdown.ts`). Lo usan servidor y cliente: la vista previa del editor calcula exactamente lo mismo que el servidor. |
| `packages/engine` | Simulación de la partida sin E/S: generador de mapa por semilla, A* con coste de terreno, rutas con hora de llegada, tick a 10 Hz, intenciones, pausa por votación, desconexiones, vista por jugador (`computeView`), instantáneas con el PRNG. Desde la fase 5: combate por rondas y detección (`combat.ts`) y simulador de equilibrio (`balance.ts`, `npm run balance`). Lo usan el servidor (autoridad) y el cliente (decodificar el mapa e interpolar rutas). |
| `apps/server` | Fastify + Socket.IO + Drizzle. Módulos independientes en `src/modules/*`. |
| `apps/web` | SPA React. `src/features/*` por pantalla, `src/components` comunes, `src/styles` sistema visual. |
| `deploy/` | systemd, Caddy, Nginx, cloudflared y scripts de instalación, actualización, copias y restauración. |
| `e2e/` | Pruebas de extremo a extremo con Playwright (Chrome real, varios usuarios a la vez). |

## Módulos del servidor

| Módulo | Ruta | Responsabilidad | Estado |
|---|---|---|---|
| Usuarios / auth | `modules/auth` | Registro, login, sesiones persistentes, perfil, roles | ✅ |
| Fotografías | `modules/photos` | Subida, validación, normalización, recortes, servido protegido | ✅ |
| Personajes | `modules/characters` | Plantillas, validación de build, propiedad de fotos | ✅ |
| Salas y lobby | `modules/rooms` | Repositorio SQL, `RoomRuntime` en memoria, `RoomManager` | ✅ |
| Chat | `modules/chat` | Global y de sala (persistido); en partida según la configuración de sala | ✅ |
| Tiempo real | `realtime/io.ts` | Autenticación de sockets, envoltorio de eventos, presencia | ✅ |
| Partidas | `packages/engine` + `modules/matches` | Mundo, bucle a 10 Hz, fotogramas por jugador a 5 Hz, instantáneas, eventos | ✅ |
| Mapa ilustrado, personajes animados, inventario, combate en partida, alianzas, eventos, bots IA, cómputo en la GPU del anfitrión, historial, administración | fases 6–10 | Ver GDD | ⏳ |

## Salas: concurrencia y consistencia

- Cada sala activa vive en un `RoomRuntime` en memoria **y** en PostgreSQL (`rooms`, `room_participants`).
- **Cola serie por sala** (`SerialQueue`): todos los comandos de una sala se ejecutan de uno en uno, así que
  dos pulsaciones simultáneas nunca se intercalan (plazas, límites de bots, expulsiones…).
- **Persistir y luego mutar**: cada comando escribe en la BD y después actualiza la memoria y difunde.
- **Idempotencia**: los comandos llevan `cid`; un `cid` repetido devuelve la misma promesa (sin duplicados).
  Además, «añadir bot» tiene un enfriamiento de 200 ms por usuario contra el doble clic.
- **Defensa en profundidad**: índices únicos parciales en BD para plazas (`room_id, distrito, género`) y para
  humanos activos por sala.
- **Estado filtrado por destinatario**: cada socket recibe su propia vista. La build de los humanos es secreta
  para los demás (solo ven nombre, foto, distrito…); los bots se ven completos porque cualquiera puede editarlos.
  La misma idea se usará para la niebla de guerra y para la percepción de los bots (`computeView`, GDD §7.4).
- **Versionado**: cada difusión incrementa `version`; el cliente descarta estados antiguos.
- **Reconexión**: Socket.IO reconecta solo; el cliente vuelve a emitir `room:join` y recibe el estado completo.
  El mismo usuario puede estar en varios dispositivos (varios sockets, un participante).
- **Reinicios**: al arrancar no hace falta precargar nada: la sala se reconstruye desde la BD cuando alguien entra.
- **Anfitrión**: si se desconecta más de 90 s y hay otro humano conectado, el rol pasa solo; al salir, también.

## Protocolo de tiempo real

Todos los eventos cliente → servidor usan confirmación: `Ack<T> = { ok: true, data } | { ok: false, error: { code, message } }`.

| Cliente → servidor | Uso |
|---|---|
| `room:join {code}` | Entrar o reconectar; devuelve `LobbyState` |
| `room:leave` | Abandonar |
| `lobby:setCharacter {character, cid}` / `lobby:applyTemplate {templateId, cid}` | Personaje propio |
| `lobby:setSlot {district}` / `lobby:setReady {ready}` | Plaza y preparación |
| `lobby:addBot {cid}` / `lobby:updateBot` / `lobby:rerollBot` / `lobby:removeBot` | Bots |
| `lobby:kick` / `lobby:transferHost` / `lobby:updateConfig` | Anfitrión |
| `chat:send {channel, body}` / `chat:history {channel}` | Chat |
| `lobby:forceStart` | El anfitrión empieza sin esperar a que todos estén preparados |
| `match:move {x, y}` / `match:stop` | Ir a una casilla / parar al acabar el paso en curso |
| `match:pause` / `match:vote {yes}` / `match:resume {ready}` | Pausa por votación y reanudación |
| `match:forfeit` / `match:sync` | Abandonar la partida / pedir la instantánea completa |

| Servidor → cliente | Uso |
|---|---|
| `lobby:state` | Estado completo filtrado (versión creciente) |
| `room:kicked`, `room:closed` | Fin de la membresía |
| `chat:message`, `notify` | Mensajes y avisos |
| `match:snapshot` | Mapa, reloj, personajes visibles y estado de pausa (al entrar, reconectar o cambiar de sala) |
| `match:frame` | Fotograma incremental a 5 Hz: solo los personajes que han cambiado para ese destinatario |
| `match:event` | Avisos de la partida (fases, caídas, pausas, conexiones, final) |

Límite por socket: cubo de 25 fichas (10/s) y chat 5 (1,2/s). Carga máxima por mensaje: 256 KB.

## Persistencia

| Tabla | Contenido |
|---|---|
| `users` | Cuenta, hash Argon2id, rol, foto predeterminada |
| `sessions` | `sha256(token)`, caducidad deslizante (30 días), agente, IP |
| `photos` | Metadatos, recorte relativo, versión de recorte |
| `character_templates` | Personajes guardados (JSON validado) |
| `rooms` | Código, nombre, anfitrión, estado, configuración |
| `room_participants` | Humanos y bots, personaje, plaza, listo, estado (activo/salió/expulsado) |
| `chat_messages` | Global y por sala |
| `matches` | Una por partida: semilla, configuración, estado, instantánea completa del mundo (PRNG incluido), ganador |
| `match_participants` | Personaje congelado al empezar, plaza, puesto final, causa y momento de la caída |
| `match_events` | Registro de cada evento con su tick y su hora de juego (base del historial y la cronología) |

Fotos en disco: `UPLOAD_DIR/photos/<usuario>/<foto>/original.webp`, `thumb.webp`, `avatar.vN.webp` (512 px)
y `marker.vN.webp` (160 px). El original normalizado (≤2048 px, orientación EXIF aplicada, sin metadatos) se
conserva siempre: recortar de nuevo genera una versión nueva sin pérdida.

Migraciones: Drizzle Kit genera SQL en `apps/server/drizzle/`; el servidor las aplica al arrancar.

## Seguridad

- Contraseñas con **Argon2id** (19 MiB, t=2). Login con tiempo igualado para usuarios inexistentes.
- Sesión en cookie `HttpOnly`, `SameSite=Lax`, `Secure` automático tras HTTPS; el token nunca se guarda en claro.
- **CSRF**: SameSite + comprobación de `Origin` en métodos que cambian estado. **CSWSH**: mismo control en el
  handshake de Socket.IO.
- **CSP** estricta (`script-src 'self' 'wasm-unsafe-eval'` para la IA en el navegador de la fase 10).
- Subidas: límite de tamaño, de píxeles (anti bombas de descompresión), validación real con sharp, re-codificación
  a WebP (elimina cargas maliciosas y metadatos), escritura atómica, IDs UUID no enumerables, servido solo a
  usuarios autenticados.
- Validación zod en **todas** las entradas (REST y sockets), limpieza de caracteres de control.
- Rate limiting HTTP global y por ruta (login, registro, subidas) y por socket.
- Roles: el primer usuario es administrador; `ADMIN_USERNAMES` y `npm run admin:promote -- usuario`.
- Registro opcionalmente cerrado con `REGISTRATION_CODE` (recomendado si el juego está en Internet).

## Pruebas

| Nivel | Dónde | Cómo |
|---|---|---|
| Unitarias | `packages/shared/src/**/*.test.ts` | `npm test -w @ceniza/shared` |
| Motor (determinismo, rutas, pausa, niebla, instantáneas, combate, equilibrio, estadísticas en partida) | `packages/engine/src/*.test.ts` | `npm test -w @ceniza/engine` |
| Informe de equilibrio | `docs/BALANCE.md` | `npm run balance` (400 enfrentamientos por pareja y escenario) |
| Integración (BD real + varios sockets) | `apps/server/test` | `npm test -w @ceniza/server` (usa `ceniza_test`) |
| Extremo a extremo (Chrome, 2 usuarios, escritorio + móvil) | `e2e/` | `npm run build -w @ceniza/web && npm run test:e2e` |

## Decisiones técnicas

| Decisión | Motivo |
|---|---|
| Fastify + Socket.IO en un solo proceso | Un servidor por VM, sin coordinación; reconexión y ack integrados |
| Sin Redis | Estado en memoria + PostgreSQL basta para una instancia. Para escalar: adaptador Redis de Socket.IO |
| Drizzle en lugar de Prisma | TS puro, sin binarios de motor, SQL explícito y migraciones legibles |
| Node sirve el frontend compilado | Despliegue mínimo: un único puerto para túnel o proxy; Caddy es opcional |
| Paquete `shared` como TS fuente | Una sola fuente de verdad de reglas y contratos para cliente y servidor |
| Versiones con enlace simbólico | `update.sh` compila en paralelo y vuelve a la versión anterior si la nueva no arranca |
| Fuentes e iconos empaquetados | Ningún CDN externo en tiempo de ejecución |

## Cómo añadir una mecánica

1. Defínela (datos y fórmulas) en `packages/shared/src/game/` con pruebas unitarias.
2. Si cambia contratos, añade el esquema zod y el tipo del evento en `schemas/`.
3. Implementa la lógica en el motor (sin E/S) y exponla con un comando validado; nunca confíes en el cliente.
4. Persiste lo que deba sobrevivir a un reinicio; añade la migración con `npm run db:generate`.
5. Prueba con varios clientes (`apps/server/test`) y, si tiene interfaz, añade el paso al E2E.

## Motor de partida (fase 4)

- **Mundo** (`packages/engine/src/world.ts`): mapa por semilla, personajes con su velocidad y visión derivadas del
  personaje, reloj de juego que solo avanza fuera de pausa, fase (`presentacion` → `cuenta_atras` → `en_curso` →
  `terminada`) y PRNG con estado. Todo es datos planos: `serializeWorld` / `restoreWorld` lo guardan y lo recuperan
  exactamente igual (comprobado con una prueba de hash).
- **Tick a 10 Hz** en el servidor (`MatchRuntime`). Las intenciones se validan contra el mundo en cuanto llegan; como
  Node es de un solo hilo, nunca se intercalan con un tick, y cada evento queda registrado con su tick.
- **Movimiento**: el servidor calcula la ruta (A* con coste de terreno) y la convierte en casillas con hora de
  llegada. El cliente interpola esa ruta con un reloj sincronizado, así que se ve fluido a 60 fps aunque los
  fotogramas lleguen a 5 Hz. Una orden nueva a mitad de paso termina ese paso primero: nunca hay teletransportes.
- **Vista por jugador**: `computeView` filtra lo que ve cada uno. Con niebla, un vivo solo ve a quien está dentro
  de su radio de visión; de los demás solo se envía el paso en curso y el siguiente, nunca su destino. Los bots
  usarán esta misma función (fase 6).
- **Fotogramas**: por cada socket se guarda lo último enviado y solo se mandan los personajes que han cambiado,
  más el reloj cada 2 s para corregir la deriva.
- **Pausa por votación**: votan los humanos vivos y conectados (mayoría o unanimidad). La votación caduca a los 30 s.
  En pausa se reanuda cuando todos los conectados pulsan «Listo», con 3 s de cuenta atrás.
- **Desconexiones** (configuración de sala): piloto automático, a cubierto, o eliminación tras los minutos de
  gracia (contados en tiempo de juego, así una pausa no castiga). Al volver, el jugador recupera el control.
- **Instantáneas**: cada 10 s, en cada cambio de fase y al apagar el servidor. Tras un reinicio, o si la sala se
  descarga de memoria por estar vacía, la partida vuelve en pausa con el mismo mundo.
- **Piloto provisional**: hasta la IA de la fase 6, bots y desconectados en piloto eligen destinos cercanos y
  caminan usando la misma API de intenciones que un humano.
- **Final**: abandonar o quedar fuera por desconexión fija el puesto; con uno solo en pie, gana. Se guardan los
  puestos, el ganador y la instantánea final, y los participantes pueden volver a ver el resultado.

## Reglas de la fase 5: estadísticas en juego

Tres capas, de la más estable a la más cambiante. Las tres son funciones puras que comparten servidor,
cliente y simulador:

1. **Estadísticas base** (`computeDerived`): atributos + distrito + habilidades + rasgo + defecto.
   `explainDerived` reproduce el mismo cálculo paso a paso para que el editor muestre de dónde sale cada
   cifra. Una prueba comprueba con builds al azar que el desglose da exactamente el valor del motor.
2. **Efectos según la situación** (`situationalStats`): terreno, noche, salud baja, escondido, trepando,
   a la carrera, primer ataque, tipo de arma, actividad… Cada efecto es un dato con su origen (`SITUATIONAL_MODIFIERS`,
   `MOVEMENT_PERKS`) y una prueba exige que apunte a un distrito, habilidad o rasgo que exista.
3. **Resolución** (`packages/engine/src/combat.ts`): combate por rondas (distancia, iniciativa, acierto,
   crítico, esquiva, defensa, aturdimiento, huida, tregua), detección de ocultos y política de combate de los
   bots. Todo con el PRNG de la partida, así que es determinista y reproducible.

Ya aplicado en la partida: el coste de cada terreno por personaje (ventajas de distrito en A* y en las rutas)
y el radio de visión según el terreno que pisa (bosque denso ×0,7, cumbre ×1,3), que respeta la niebla de
guerra. Las partidas guardadas por la 0.4 se recuperan con las reglas de entonces.

El combate, la detección y las actividades se conectarán al mundo con los sistemas de las fases 7–8 (mapa,
recursos, inventario); hoy los usan el simulador y la prueba de fuerza del editor, que corre `runMatchups`
en un Web Worker.

## Cómputo en la GPU del anfitrión (plan, fases 6–10)

La VM no tiene GPU. Lo que la necesite (IA de bots con modelos, pasos de generación del mapa, generar piezas
de personaje desde una foto) se ejecuta en el navegador del **anfitrión de la sala** con WebGPU, o en el del
propio jugador cuando el trabajo es suyo (el editor). Diseño:

```
Servidor (autoridad)                         Navegador del anfitrión
  ComputeBroker por sala  ── compute:job ──►   worker WebGPU (transformers.js / ONNX Runtime Web)
  plazo, tamaño y vista mínima                 modelos servidos por la VM desde /models (caché)
  valida o descarta        ◄─ compute:result ─ resultado (intenciones, texturas, piezas)
  reparte / guarda
```

- **Capacidad:** al crear la sala o al pasar el rol, el cliente mide WebGPU, memoria y una prueba corta, y la
  anuncia (`compute:caps`). El broker solo encarga trabajos que el dispositivo puede hacer.
- **Autoridad:** los resultados visuales se guardan tal cual. Lo que afecta al juego vuelve como intención y
  pasa la misma validación que la de un humano, así que un anfitrión tramposo no consigue ventaja.
- **Tolerancia a fallos:** cada trabajo tiene plazo. Si vence o el anfitrión se va, el broker lo reasigna a
  otro humano con GPU o usa el modo de CPU del servidor (utility AI, generador procedural, asignación de
  piezas sin generar). Ningún trabajo de GPU es imprescindible para jugar.
- **Privacidad:** el anfitrión recibe solo la vista filtrada del bot (`computeView`) o la foto que su dueño ha
  aceptado compartir para generar su personaje; nunca builds secretas ni datos de otras salas.
- **Persistencia:** las piezas de personaje generadas se guardan como las fotos (`UPLOAD_DIR`, tabla propia,
  servidas solo a usuarios autenticados) y la apariencia del personaje las referencia por id.

