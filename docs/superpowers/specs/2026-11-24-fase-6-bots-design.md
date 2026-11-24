# Fase 6: cierre de los bots autónomos (diseño)

Fecha: 24/11/2026 · Rama: `fase-6-cierre` · Estado: aprobado en la conversación con Andrés.

## Intención

Terminar la fase 6 (bots autónomos) en todo lo que no depende de los sistemas de la fase 8. El objetivo
es que los bots tengan voz y estilo propios, que jueguen limpio de verdad y que la partida no dé tirones
al empezar. Comer, beber, fabricar, aliarse, atacar y traicionar siguen esperando a la fase 8, que trae
esos sistemas.

## Decisión sobre la GPU de los clientes

Andrés propuso repartir los bots entre las GPU de los clientes, con rescates y repartos, **solo si hace
falta para aliviar el servidor y el juego va mejor**. Medido el 24/11/2026 en este entorno (23 bots,
mapa grande, 5 min de partida): 1,8 ms de media por tick de los 100 ms disponibles, p95 8,5 ms. La IA
no es trabajo de GPU (ramas y simulaciones pequeñas), y moverla a los clientes añadiría ida y vuelta por
la red, fallos y validación. **No se hace.** Lo único que pesa es un pico al empezar (hasta 73 ms durante
2–3 s), que se arregla en el servidor. El plan de cómputo en el anfitrión queda documentado como
opcional, con un criterio medible para retomarlo.

## Objetivos

1. **Frases de los bots** por personalidad y situación (GDD §13, «Diálogo»).
2. **El estilo de juego modula la IA** (GDD §13): hoy se elige en el lobby y la IA no lo usa.
3. **Juego limpio en las estimaciones de combate**: contra un humano, el bot no usa su build secreta.
4. **Sin pico al empezar**: misma IA, menos coste por tick en los primeros segundos.
5. Pruebas y documentación (GDD, arquitectura, estado).

## No objetivos

- Decisiones de la fase 8 (beber, comer, fabricar, aliarse, atacar, traicionar) y sus disparadores de
  frases. Las frases de esas situaciones quedan escritas, sin disparar.
- Modelo de lenguaje, red de decisión de Experto y evaluación de combates en GPU.
- Chat de partida en la pantalla de juego (fase 10).

## Antiobjetivos (si pasa esto, ha fallado aunque funcione)

- Un bot que con su frase delata a alguien que el oyente no ve, o que habla de algo que no ha percibido.
- Frases que saturan el registro o tapan el mapa.
- Que las frases cambien la partida: mismo mundo con y sin frases (posiciones, rutas, decisiones).
- Que la optimización cambie un solo resultado de combate.
- Que un humano con piloto automático «hable» por su jugador.

## Restricciones

- El servidor es la autoridad; los bots usan las mismas intenciones que un humano.
- Determinismo: todo el azar sale de semillas; las frases no tocan el PRNG del mundo.
- Instantáneas compatibles: los campos nuevos son opcionales y las partidas guardadas se recuperan.
- En este entorno no se pueden instalar dependencias: las pruebas de `shared` y `engine` se ejecutan con
  un sustituto de vitest; las del servidor y la web se escriben, pero no se pueden ejecutar aquí.

## Enfoques considerados

| Tema | Opciones | Elegida y por qué |
|---|---|---|
| Dónde salen las frases | (a) chat de sala; (b) bocadillo sobre el bot + registro de la partida | **(b)**. La pantalla de partida no tiene chat y el chat de partida por defecto es «solo alianza», que no existe hasta la fase 8. El bocadillo respeta la niebla como las posiciones. |
| Quién oye | (a) todos; (b) quien ve al bot | **(b)**, con la misma regla de `computeView`. |
| Cómputo de bots | (a) servidor; (b) GPU de los clientes con rescates | **(a)**, por las medidas de arriba. |
| Estimación contra humanos | (a) build real (hoy); (b) build media del distrito hasta verle pelear | **(b)**, aprobado por Andrés. El refinamiento por observación llega con el combate de la fase 8. |
| Pico del arranque | (a) GPU; (b) guardar cálculos repetidos + presupuesto de simulaciones por tick | **(b)**: mismo resultado, menos coste. |

## Diseño

### 1. Frases

**Catálogo** (`packages/shared/src/game/phrases.ts`). Datos, no código:
- Situaciones vivas: `estallido`, `acecho`, `huida`, `anochecer`, `amanecer`, `caida`, `region`,
  `victoria`. Para la fase 8: `propuesta`, `acepta`, `rechaza`, `traicion`, `suplica`.
- Ocho voces: `fiero` (agresivo), `prudente` (cauteloso), `receloso` (desconfiado), `frio`
  (estratega), `cordial` (pacífico y cooperativo), `taimado` (manipulador y traicionero), `curioso`
  (explorador) y `caotico` (impredecible).
- Tres frases por voz en las situaciones vivas y dos en las de la fase 8. Identificador estable
  `situacion.voz.n`, listo para traducir.
- Marcador único `{objetivo}` (nombre del otro). Nunca nombres de región, coordenadas ni datos que el
  bot no haya percibido.
- Estilo: frases cortas (hasta 64 caracteres antes de sustituir), sin emojis, pocas exclamaciones, el
  vocabulario de la Ciudadela con mesura.

**Motor** (`packages/engine/src/speech.ts`), sin E/S:
- `want(w, a, situación, objetivo?)`: un disparador propone una frase. Decide con una tirada por hash
  (semilla, bot, tick, situación), no con el PRNG del mundo. Si sale, queda **pendiente** con una
  caducidad, y sustituye a otra pendiente de menos prioridad.
- `trySpeak(w, a)`, desde `think`: si hay frase pendiente y vigente, el bot está vivo y en partida, ha
  pasado su enfriamiento (20–50 s según sociabilidad) y la separación global de la partida (6 s),
  elige una frase de su voz que no haya dicho hace poco y emite el evento `dice`.
- Disparadores: estallido (al empezar), acecho y huida (al cambiar de plan en `think`), anochecer y
  amanecer, caída de alguien (más probable si lo había visto), región nueva para el propio bot y
  victoria (inmediata, sin esperas).
- Solo hablan los bots (`kind === 'bot'`). Con `rules.speech === false` (chat de partida desactivado)
  no habla nadie.
- Estado: `mind.talk` (pendiente, última vez y frases recientes) y `world.speechAt`; opcionales y
  dentro de la instantánea.
- `think` devuelve los eventos que genera (hoy, como mucho una frase); `tick` los añade a los suyos.
- `canHear(w, usuario, bot)`: misma regla que `computeView` (con niebla, solo quien lo ve; los caídos
  y los espectadores lo oyen todo).

**Servidor**: `MatchRuntime` envía `match:event` de tipo `dice` solo a los sockets que pueden oírlo y lo
guarda en `match_events`. `createMatch` pasa `speech: matchChat !== 'desactivado'`.

**Cliente**:
- La tienda de la partida guarda la última frase de cada bot.
- `MapCanvas` dibuja un bocadillo sobre la cabeza durante unos 5 s, encima de la noche y la niebla, con
  entrada corta y salida suave, sin bucles.
- El registro muestra «Nombre «frase»» con el nombre destacado.
- Sin avisos emergentes para las frases.
- El selector «Chat durante la partida» explica que «Desactivado» también calla a los bots.

### 2. Estilo de juego

`PLAYSTYLES[k].actionBias` multiplica la puntuación de cada opción (obelisco, explorar, acechar, huir,
esconderse, esperar). Por ejemplo, el cazador acecha más, el superviviente se esconde y espera más, y
el saqueador va más al Obelisco y explora. El piloto automático de un humano usa «equilibrado».

### 3. Juego limpio

En `estimateOdds`, contra un humano se usa una build supuesta: el arquetipo Equilibrado con el distrito
del humano, que es público. Contra un bot se usa su build real, que es pública en el lobby.

### 4. Pico del arranque

- `fighterStats` guarda en caché, por luchador, las estadísticas de cada situación (clave con los
  umbrales de salud que usan las reglas). Resultado idéntico, comprobado con el hash del informe de
  equilibrio y de un mundo con 23 bots.
- Presupuesto de simulaciones por tick para las estimaciones. Si se agota, la estimación queda
  provisional (la anterior o 0,5) con caducidad corta y se afina en el siguiente ciclo. Se mide antes y
  después: media, p95, p99, máximo y ticks de más de 20 ms.

## Pruebas

- `shared`: catálogo completo (todas las voces en todas las situaciones, identificadores únicos,
  marcadores válidos, longitud), cada personalidad con su voz y estilos con sesgos válidos.
- `engine`:
  - frases deterministas;
  - solo hablan los bots;
  - silencio con `speech: false`;
  - separación global y enfriamiento;
  - acecho con el nombre del objetivo;
  - victoria del bot;
  - el mundo se mueve igual con y sin frases;
  - `canHear` con niebla;
  - estilos (cazador frente a superviviente; saqueador y Obelisco);
  - estimación idéntica contra dos humanos de builds distintas;
  - presupuesto de simulaciones por tick respetado;
  - partidas antiguas sin los campos nuevos.
- Servidor: prueba de integración del reparto de `dice` (escrita; ejecución pendiente fuera de aquí).

## Lo que decide quien lo construye

Los textos exactos de las frases, las probabilidades, las prioridades y caducidades, el tamaño del
presupuesto (según la medida) y el aspecto final del bocadillo (con las skills de diseño del proyecto).
