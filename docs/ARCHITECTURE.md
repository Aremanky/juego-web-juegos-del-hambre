# Arquitectura técnica

> Fase 2 · Estado: implementada y probada para usuarios, fotos, personajes, salas y lobby.
> Las piezas de partida (motor, mapa, combate, bots…) se añaden en las fases 4–9 sobre esta base.

## Visión general

```
 Navegador (móvil u ordenador)                       VM Ubuntu 24.04 (Proxmox)
┌──────────────────────────────┐   HTTPS / WSS   ┌──────────────────────────────────────────────┐
│ React 19 + Vite (SPA)        │ ◄─────────────► │ cloudflared (túnel)  ó  Caddy (HTTPS)        │
│  · React Query (REST)        │                 │            │ http://127.0.0.1:3000           │
│  · Zustand (estado de sala)  │                 │ ┌──────────▼─────────────────────────────┐   │
│  · socket.io-client          │                 │ │ Node 22 · Fastify 5 · Socket.IO 4      │   │
│  · (fase 7) PixiJS para mapa │                 │ │  REST: auth, fotos, plantillas, salas  │   │
│  · (fase 10) ONNX/WebGPU     │                 │ │  Tiempo real: lobby y chat (luego: partida) │
└──────────────────────────────┘                 │ │  RoomManager → RoomRuntime (memoria)   │   │
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
| `packages/shared` | Reglas del juego y contratos: atributos y fórmulas (`derived.ts`), habilidades, rasgos, defectos, distritos, arquetipos, personalidades/dificultades de bots, fábrica de bots, generador de retratos SVG, PRNG serializable, esquemas zod de API/sockets y tipos del estado del lobby. Lo usan servidor y cliente: la vista previa del editor calcula exactamente lo mismo que el servidor. |
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
| Chat | `modules/chat` | Global y de sala (persistido) | ✅ (partida: fase 4) |
| Tiempo real | `realtime/io.ts` | Autenticación de sockets, envoltorio de eventos, presencia | ✅ |
| Motor de partida | `packages/engine` (fase 4) | Tick, intenciones, instantáneas, sincronización | ⏳ |
| Mapa, movimiento, inventario, combate, alianzas, eventos, bots IA, historial, administración | fases 5–10 | Ver GDD | ⏳ |

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

| Servidor → cliente | Uso |
|---|---|
| `lobby:state` | Estado completo filtrado (versión creciente) |
| `room:kicked`, `room:closed` | Fin de la membresía |
| `chat:message`, `notify` | Mensajes y avisos |

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

## Plan del motor (fase 4)

- `packages/engine`: estado del mundo serializable, tick a 10 Hz, cola de intenciones aplicada al inicio de
  cada tick, PRNG con estado guardado.
- Inicio desde el lobby (automático al estar todos listos o forzado por el anfitrión), asignación de plazas libres,
  cuenta atrás y presentación.
- Sincronización: instantánea al entrar o reconectar, deltas agregados a 5 Hz, movimiento como segmentos de ruta
  para que el cliente interpole sin saltos.
- Persistencia: tablas `matches`, `match_participants`, `match_events`; instantánea cada 10 s y al apagar; tras un
  reinicio, la partida vuelve en pausa hasta que todos pulsan «Listo».
