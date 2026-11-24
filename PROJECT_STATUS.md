# PROJECT_STATUS — Los Juegos de la Ceniza

**Versión:** 0.6.1 · **Última actualización:** 24/11/2026 (sesión 3: fases 4 a 7 y pase visual) · **Avance global: ~69 %**

El proyecto es ejecutable: se puede registrar, guardar fotos y personajes, crear salas, invitar por código o
enlace, preparar la partida con amigos y bots y **jugarla en tiempo real**.

Desde la 0.6:
- **La arena es la completa:** ríos, caminos, pantanos, ruinas, poblados, cuevas y manantiales con nombre. Hay
  regiones que se descubren al llegar y un ciclo de día y noche que cambia lo que se ve.
- **El mapa es el ilustrado:** relieve sombreado, curvas de nivel y modo holograma.
- **En el mapa ya no va la foto:** cada participante es un personaje animado.
- **Los bots piensan:** van al Obelisco o se apartan según su carácter, exploran, acechan a quien creen poder
  vencer y huyen de quien les supera. Ven lo mismo que vería un humano.

Desde la 0.6.1 (pase visual):
- **El mapa ya no parece un mosaico con pegatinas:** suelo continuo, orillas, ríos y caminos curvos, objetos
  repartidos sin rejilla con la misma luz y sombras, nítido a cualquier zoom, y luces de noche.
- **Personajes nuevos** y pestaña **Apariencia** en el editor (piel, peinado, ropa, complementos, complexión).
- Los objetos del mapa están preparados para sprites pintados con SpriteCook (hojas ya generadas, falta
  descargarlas a `public/map/`).

Todavía no hay combate en la partida, ni recursos ni eventos (fases 8–9).

Código: [github.com/Aremanky/juego-web-juegos-del-hambre](https://github.com/Aremanky/juego-web-juegos-del-hambre).

## Avance por fase

| Fase | Contenido | Peso | Avance | Barra |
|---|---|---|---|---|
| 1 | Entorno, experiencia y mecánicas (GDD) | 4 % | **100 %** | ██████████ |
| 2 | Arquitectura, estructura e infraestructura | 6 % | **90 %** | █████████░ |
| 3 | Usuarios, salas, lobby, personajes, fotos persistentes | 11 % | **100 %** | ██████████ |
| 4 | Motor multijugador y sincronización de partida | 11 % | **100 %** | ██████████ |
| 5 | Estadísticas, habilidades y reparto de puntos | 6 % | **100 %** | ██████████ |
| 6 | Bots autónomos (IA en el servidor y en la GPU del anfitrión) | 11 % | **70 %** | ███████░░░ |
| 7 | Mapa ilustrado, personajes animados, movimiento y exploración | 14 % | **85 %** | ████████▌░ |
| 8 | Recursos, combates, alianzas y traiciones | 11 % | 15 % | █▌░░░░░░░░ |
| 9 | Eventos dinámicos y progresión | 6 % | 5 % | ▌░░░░░░░░░ |
| 10 | Interfaz completa, personalización amplia y personaje desde foto | 13 % | 45 % | ████▌░░░░░ |
| 11 | Pruebas completas, optimización y errores | 4 % | 50 % | █████░░░░░ |
| 12 | Despliegue definitivo en Proxmox | 3 % | 60 % | ██████░░░░ |

Los pesos se recalcularon en esta sesión al ampliar el alcance de las fases 7 y 10 (personajes animados,
personalización amplia, personaje desde foto y GPU del anfitrión).

Notas de reparto:
- **F6 (70 %)**: hecho lo que la fase puede hacer sin los sistemas de la 8:
  - utility AI con personalidad y dificultad;
  - percepción igual a la de un humano y memoria que se olvida;
  - estimación de combates con el motor real;
  - las decisiones de la arena actual;
  - piloto automático para desconectados.
  
  Falta comer, beber, fabricar, aliarse, atacar y traicionar (llegan con esos sistemas en la fase 8) y las
  frases de los bots. La parte con modelos en la GPU del anfitrión (chat con lenguaje, red para Experto) es
  opcional: la IA actual cuesta 1 ms por tick en el servidor y no necesita GPU.
- **F7 (85 %)**: generador completo, regiones y exploración, día y noche con efecto en la visión, mapa
  ilustrado (rehecho en la 0.6.1: bloques por zoom, objetos con luz y sombra, luces de noche), holograma y
  personajes animados con las animaciones de moverse. Faltan las animaciones y estados
  de acciones que aún no existen (atacar, buscar, fabricar, herido, envenenado), los cambios del mapa por
  eventos (fase 9) y, si hiciera falta en móviles, pasar el dibujo a PixiJS.

## Funcionalidades completadas (probadas)

**Cuentas, fotos y personajes**
- Registro e inicio de sesión, sesión recordada 30 días, cierre de sesiones, cambio de nombre y contraseña,
  código de registro opcional; el primer usuario es administrador.
- Biblioteca de fotos en el servidor: subida con normalización, recorte circular no destructivo, versiones de
  512 y 160 px, miniatura, etiquetas, predeterminada, borrado y límites.
- Personajes: 7 atributos con coste creciente, 16 habilidades, 10 rasgos, 7 defectos, 12 distritos,
  8 arquetipos, identidad, estrategia de piloto automático y plantillas reutilizables.

**Estadísticas en juego (fase 5)**
- Desglose de cada estadística en el editor y efectos según la situación de cada build.
- Ventajas de distrito por terreno en el movimiento y visión según el terreno, de día y de noche.
- Motor de combate por rondas, catálogo de armas y protecciones, detección de ocultos.
- Simulador de equilibrio (`npm run balance`): arquetipos entre ×0,84 y ×1,16 de la media.
- Prueba de fuerza en el editor, en un worker. Números en formato español.

**Salas, lobby y partida (fases 3 y 4)**
- Salas con configuración completa, código o enlace, tablero de 12 × 2 plazas, bots que añade cualquiera,
  anfitrión, reconexión, varios dispositivos, chat y recuperación tras reiniciar.
- Inicio automático o forzado, sobrevuelo de la arena, presentación y cuenta atrás.
- Mover con un toque, niebla de guerra opcional, pausa por votación y políticas de desconexión.
- Abandono, clasificación, ganador, instantáneas cada 10 s y recuperación en pausa.
- Probada con 24 humanos: tick p95 de 1,9 ms y 6,8 KB/s por jugador (`docs/LOAD.md`).

**Bots con IA (fase 6)**
- Deciden entre ir al Obelisco al empezar, explorar la región sin descubrir más cercana, acechar a quien
  creen poder vencer, huir hacia cobertura de quien les supera, esconderse y esperar.
- Personalidad (agresivo, cauteloso, explorador…) y dificultad: ruido en la decisión, cada cuánto piensan,
  cuánto recuerdan y lo bien que estiman un combate (de 4 a 30 simulaciones, con terreno en Difícil y
  Experto).
- Juego limpio: perciben lo mismo que un humano en su asiento (visión por terreno y noche, niebla) y solo
  recuerdan lo que han visto.
- Usan las mismas órdenes que un humano, validadas igual.
- El piloto automático de un humano desconectado usa la misma IA con su estrategia. Con «a cubierto», solo
  busca dónde esconderse.
- Coste medido con 23 bots en el mapa grande: 1 ms de media por tick, p95 5 ms.

**Arena completa (fase 7)**
- Generador por semilla con relieve, lagos, pantanos, 2–3 ríos que bajan de manantiales de montaña,
  6–10 puntos de interés con nombre y caminos desde la explanada, con vados en los ríos.
- Regiones con el nombre de su punto de interés. Al entrar en una se descubre: aparece su nombre en tu mapa y
  «Has llegado a…» solo te lo dice a ti. El panel lleva la cuenta de lo descubierto.
- Día y noche por ritmo de sala (8 + 4 min en Estándar): de noche se ve menos (×0,6 con las ventajas de cada
  personaje), el mapa se oscurece y un reloj indica cuánto falta para el cambio.
- Mapa ilustrado horneado una vez:
  - relieve sombreado y curvas de nivel;
  - árboles, rocas, cumbres nevadas y pantanos;
  - ríos y caminos continuos, ruinas y poblados;
  - iconos y rótulos de los lugares conocidos.
  
  El botón «Holograma» cambia a curvas turquesas con la retícula de sectores A–L por 1–12.
- Personajes animados en lugar de la foto:
  - esqueleto de piezas con vistas de frente, espalda y lado;
  - reposo, andar, correr, nadar, agacharse en la maleza, caído y celebración;
  - anillo del color del jugador, punteado si va con piloto automático;
  - peinado del camafeo, ropa del color del jugador y ribete del distrito.
- 55 fps con todo el mapa y los personajes en el Chrome sin GPU de las pruebas.

**Interfaz e infraestructura**
- Identidad visual «Ceniza y cristal» en todas las pantallas; revisiones anti-IA sin señales.
- Monorepo (shared, engine, server, web), systemd, copias, actualizaciones con vuelta atrás, Caddy, Nginx y
  cloudflared.

## Pruebas ejecutadas (resultado real, última ejecución)

| Suite | Resultado | Cubre |
|---|---|---|
| Unitarias (`packages/shared`) | **23/23 ✔** | Reglas de personaje, efectos según la situación, desglose idéntico al motor |
| Motor (`packages/engine`) | **46/46 ✔** | Las 35 anteriores más 11 nuevas. Del generador: determinista, ríos, caminos hasta cada poblado y ruina, nombres únicos, anillo de salida limpio, instantánea con relieve y compatibilidad con la 0.5. Del día y la noche: ciclo, visión nocturna con niebla y avisos. De la exploración: región descubierta solo para quien entra. De la IA: bots que se mueven solos y determinismo, el agresivo al Obelisco y el cauteloso apartándose, huida y acecho, niebla y olvido del Fácil, y 23 bots por debajo de 5 ms por tick |
| Integración (`apps/server`, PostgreSQL real) | **47/47 ✔** | Todo lo anterior más la arena con bots: instantánea con relieve, lugares y ciclo, bots moviéndose con la IA del servidor, aviso de región privado y noche para todos |
| Carga (`npm run load`, 30 s) | **✔** | 24 humanos, mapa grande con niebla: tick p95 1,9 ms, respuesta p95 4 ms, 6,8 KB/s por jugador |
| Extremo a extremo (Chrome real) | **1/1 ✔** | Del registro a la partida en escritorio y móvil, ahora con el mapa ilustrado, los personajes, el reloj de día, el holograma, la noche y una medida de 55 fps |
| Compilación y tipos | ✔ | `tsc` en los 4 paquetes, build de servidor y web |
| Diseño (unslop-ui y detector de Impeccable) | **0 señales** | Sobre todas las pantallas |
| Producción | ✔ | Health 0.6.0, SPA y rutas internas, CSP, caché inmutable |

## Skills y plugins instalados para el desarrollo

| Skill o plugin | Para qué se usa |
|---|---|
| Impeccable, unslop-ui, Taste Skill | Diseño de la interfaz y detección de señales de IA |
| pixijs-skills (oficial de PixiJS) | Si el mapa pasa a PixiJS en móviles (de momento basta canvas 2D) |
| gamedev-agent-skills (8 skills) | Utility AI de los bots (fase 6), generación procedural, supervivencia, HUD y arte coherente |
| transformers-js (oficial de Hugging Face) | Modelos en la GPU del navegador: personaje desde foto y modelos de bots en el anfitrión |
| anthropic-art-skills | Arte generativo con código |
| openai-develop-web-game | Ciclo de pruebas con Playwright para el bucle de partida |
| Context Compactor, Concise Intuitive Answers | Gastar menos contexto en sesiones largas sin perder precisión |

## Funcionalidades pendientes

- **Fase 6:** frases de los bots y, opcional, modelos en la GPU del anfitrión. El resto de decisiones llega con
  la fase 8.
- **Fase 7:** animaciones y estados de las acciones de la fase 8, cambios del mapa por eventos (fase 9) y PixiJS
  si hiciera falta en móviles reales.
- **Fase 8:** combate en la partida, medidores de supervivencia, recursos, inventario, fabricación, alianzas y
  traiciones, y que los bots los usen.
- **Fase 9:** eventos dinámicos y Director, zona segura y progresión.
- **Fase 10:** pantallas de partida, historial, logros, administración, editor de apariencia amplio y creación
  del personaje desde una foto con generación de piezas.
- **Fase 12:** validar en tu VM real (systemd, ufw, túnel de Cloudflare con tu dominio).

## Errores y limitaciones conocidas

- Sin combate en la partida todavía: los bots acechan y huyen, pero nadie ataca. Una partida solo termina por
  abandonos o desconexiones con la regla «eliminar».
- Los personajes animados se dibujan en el cliente con piezas vectoriales; el editor de apariencia (fase 10)
  los hará personalizables.
- La IA tiene un pico de unos 60 ms en los primeros ticks de la partida, cuando todos se ven en el anillo.
  Después va en 1 ms de media.
- La prueba de fuerza tiene un margen de ±5 puntos en cada casilla y de ±2 en las medias.
- El chat de sala durante la partida solo funciona con «Chat durante la partida: Todos».
- Las fotos HEIC dependen de que el navegador las abra (Safari sí; Chrome en Windows no, y avisa).
- No hay panel de administración web todavía; existe `npm run admin:promote`.
- systemd, ufw y Caddy no se han podido ejecutar aquí (el entorno no tiene systemd). Ver `docs/DEPLOYMENT.md` §9.

## Próximos pasos (sesión 4)

1. **Fase 8:** combate en la partida con el motor de la fase 5 (atacar, emboscar, huir), medidores de
   supervivencia, búsqueda de recursos con los efectos de actividad ya definidos, inventario y fabricación;
   los bots aprenden a usarlos.
2. Animaciones de atacar, buscar y fabricar, y estados visibles en los personajes.
3. **Fase 9:** el Director de eventos y la zona segura.

## Cómo continuar en la próxima sesión

El código está en GitHub. `main` tiene la fase 4. Las ramas van una encima de otra:
`fase-5-estadisticas` (#2), `fase-4-cierre` (#3) y `fase-6-y-7` (#4). Fusiónalas en ese orden. Al empezar la
próxima sesión basta con decir que siga desde el repositorio.
