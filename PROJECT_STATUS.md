# PROJECT_STATUS — Los Juegos de la Ceniza

**Versión:** 0.5.1 · **Última actualización:** 23/11/2026 (sesión 3: fase 5 y cierre de la fase 4) · **Avance global: ~54 %**

El proyecto es ejecutable: se puede registrar, guardar fotos y personajes, crear salas, invitar por código o
enlace, preparar la partida con amigos y bots y **jugarla en tiempo real**: presentación, cuenta atrás, mapa por
semilla, movimiento, pausa por votación, desconexiones con piloto automático y recuperación tras reiniciar el
servidor.

Con la fase 5, las estadísticas ya mandan:
- Cada distrito se mueve distinto por cada terreno, y la visión cambia con el terreno que se pisa.
- El editor explica de dónde sale cada cifra y lleva una prueba de fuerza que enfrenta tu build a los ocho
  arquetipos.
- Hay un motor de combate por rondas y un simulador de equilibrio.

Todavía no hay combate en la partida, ni recursos ni eventos (fases 7–9).

Código: [github.com/Aremanky/juego-web-juegos-del-hambre](https://github.com/Aremanky/juego-web-juegos-del-hambre).

## Avance por fase

| Fase | Contenido | Peso | Avance | Barra |
|---|---|---|---|---|
| 1 | Entorno, experiencia y mecánicas (GDD) | 4 % | **100 %** | ██████████ |
| 2 | Arquitectura, estructura e infraestructura | 6 % | **90 %** | █████████░ |
| 3 | Usuarios, salas, lobby, personajes, fotos persistentes | 11 % | **100 %** | ██████████ |
| 4 | Motor multijugador y sincronización de partida | 11 % | **100 %** | ██████████ |
| 5 | Estadísticas, habilidades y reparto de puntos | 6 % | **100 %** | ██████████ |
| 6 | Bots autónomos (IA en el servidor y en la GPU del anfitrión) | 11 % | 35 % | ███▌░░░░░░ |
| 7 | Mapa ilustrado, **personajes animados**, movimiento y exploración | 14 % | 20 % | ██░░░░░░░░ |
| 8 | Recursos, combates, alianzas y traiciones | 11 % | 15 % | █▌░░░░░░░░ |
| 9 | Eventos dinámicos y progresión | 6 % | 5 % | ▌░░░░░░░░░ |
| 10 | Interfaz completa, **personalización amplia y personaje desde foto** | 13 % | 35 % | ███▌░░░░░░ |
| 11 | Pruebas completas, optimización y errores | 4 % | 45 % | ████▌░░░░░ |
| 12 | Despliegue definitivo en Proxmox | 3 % | 60 % | ██████░░░░ |

**Por qué el avance global solo sube un punto.** En esta sesión se ha ampliado el alcance:
- Personajes animados en el mapa en lugar de la foto (fase 7).
- Un sistema de personalización muy amplio y crear el personaje desde una foto, generando las piezas que
  falten (fase 10).
- Usar la GPU del anfitrión de la sala para lo pesado (fases 6, 7 y 10).

Los pesos se han recalculado con ese alcance (antes F7 12 % y F10 8 %; ahora 14 % y 13 %). La fase 5 completa
compensa justo lo que crece el resto.

Notas de reparto:
- **F4 (100 %)**: cerrada con el sobrevuelo de la arena en la presentación y la prueba de carga con 24 participantes
  (resultados abajo y en `docs/LOAD.md`).
- **F5 (100 %)**: todo lo que la fase promete:
  - atributos con efecto real y desglose comprobado;
  - efectos según la situación y ventajas de distrito aplicadas al movimiento y a la visión de la partida;
  - reglas de combate, detección y huida listas en el motor;
  - simulador de equilibrio con el criterio del GDD cumplido;
  - prueba de fuerza en el editor.
  
  Conectar el combate y las actividades al mundo es trabajo de las fases 7–8 y cuenta allí.
- **F6 (35 %)**: incorporación desde el lobby completa, piloto provisional que camina por la arena y política de
  combate de los bots (huida, defensa, emboscada) ya en el motor. Falta la utility AI, la memoria y la
  percepción con `computeView`, y la parte opcional en la GPU del anfitrión (diálogo, dificultad Experto).
- **F7 (20 %)**: mapa por semilla, A* con coste por personaje, movimiento interpolado y niebla con visión por
  terreno. Falta el mapa ilustrado con PixiJS, ríos, caminos, puntos de interés y los personajes animados con
  esqueleto 2D y todas sus animaciones.
- **F8 (15 %)**: combate por rondas, armas, protecciones, detección de ocultos, huida y tregua hechos y probados
  como reglas. Falta llevarlos a la partida con recursos, inventario, fabricación, alianzas y traiciones.
- **F10 (35 %)**: faltan las pantallas de partida, el editor de apariencia grande y la creación desde foto con
  generación de piezas.

## Funcionalidades completadas (probadas)

**Cuentas y sesiones**
- Registro e inicio de sesión; el primer usuario es administrador.
- Sesión recordada 30 días en el mismo navegador (cookie HttpOnly con renovación deslizante).
- Cerrar sesión, cerrar todas las sesiones, cambiar nombre y contraseña (cierra las demás sesiones).
- Código de registro opcional para servidores públicos.

**Biblioteca de fotografías (en el servidor)**
- Subida desde móvil u ordenador con normalización en el navegador (orientación EXIF; HEIC si el navegador lo abre).
- Recorte circular no destructivo: el original se conserva y se puede reajustar cuando quieras.
- Versiones generadas: retrato 512 px, versión pequeña de 160 px y miniatura.
- Nombre, etiquetas, foto predeterminada, borrado y límite por usuario.
- Validación real del archivo, límites de tamaño y de píxeles, archivos solo para usuarios autenticados, caché inmutable.

**Personajes**
- Sistema de 7 atributos con coste creciente, presupuesto 24/28/32 y +2 con defecto.
- 16 habilidades con requisitos, 10 rasgos (ventaja y contrapartida), 7 defectos, 12 distritos con ventaja propia.
- 8 arquetipos rápidos; comparación con arquetipos o personajes guardados (radar y estadísticas derivadas).
- Identidad: nombre, epíteto, género, distrito preferido, color, marco, retrato, foto de victoria y presentación.
- Estrategia de piloto automático (combate, umbral de huida, alianzas).
- Plantillas guardadas en el servidor, reutilizables entre sesiones y dispositivos (crear, editar, duplicar, borrar).

**Estadísticas en juego (fase 5)**
- **Desglose en el editor:** al pulsar una estadística se ve la fórmula, el valor de los atributos y lo que suma
  o multiplica el distrito, cada habilidad, el rasgo y el defecto.
- **Efectos según la situación** de cada build, listados en el editor:
  - terreno, noche y salud baja;
  - escondido, trepando o a la carrera;
  - primer ataque y tipo de arma;
  - actividades como pescar o recoger madera.
- **En la partida:** el distrito VII cruza el bosque un 12 % más rápido, el X no se frena en la roca y el IV nada
  sin penalización. El bosque denso recorta la visión (×0,7) y la cumbre la amplía (×1,3). La niebla de guerra lo
  respeta.
- **Motor de combate por rondas:**
  - distancia, iniciativa, acierto, crítico, esquiva, defensa, aturdimiento y emboscada;
  - Golpe brutal, Último aliento, Contraataque y Carrera;
  - huida según el GDD y tregua solo si los dos la eligen;
  - catálogo de armas y protecciones;
  - detección de ocultos por sigilo, cobertura y distancia.
- **Simulador de equilibrio** (`npm run balance` → `docs/BALANCE.md`): los ocho arquetipos por parejas en cinco
  escenarios. Todos quedan entre ×0,84 y ×1,16 de la media (el GDD exige ×0,5–×1,5) y cada estilo tiene su
  escenario fuerte. Los ajustes que ha pedido están anotados en el GDD §16.
- **Prueba de fuerza en el editor:** tu build contra los ocho arquetipos en los cinco escenarios, con media, mejor y
  peor situación y rival más duro. Se recalcula sola en un worker al repartir puntos, también en móvil.
- Números en formato español en todo el editor (1,32 c/s, ×1,15, 79 %).

**Salas y lobby en tiempo real**
- Crear sala con configuración completa (incluida duración ilimitada); unirse por código o por enlace `/r/CÓDIGO`.
- Tablero de distritos (12 × 2 plazas) con unicidad garantizada en memoria y en BD, también ante peticiones simultáneas.
- «+ AÑADIR BOT» para cualquier participante; límites total y por persona; edición por cualquiera; prioridad humana.
- Anfitrión: configurar, expulsar, ceder el puesto; traspaso automático si se desconecta.
- Reconexión automática, varios dispositivos por usuario, persistencia y recuperación tras reiniciar el servidor.
- Chat global y de sala, con historial. La build de cada humano es secreta para los demás.

**Partida en tiempo real (fase 4)**
- Inicio automático cuando todos están preparados y conectados (cuenta atrás de 5 s que se cancela si alguien se
  desprepara) o **inicio forzado** por el anfitrión. A quien no eligió plaza se le asigna una libre de su género.
- Presentación de los participantes con sus camafeos o fotos y cuenta atrás de 15 s en el anillo del Obelisco.
- Mapa por semilla (64², 96² o 128²) con lagos, orillas, praderas, bosque, roca, montaña, cumbres y la explanada.
- Mover con un toque: ruta con el coste de terreno de tu personaje y su velocidad, interpolada sin saltos.
- Niebla de guerra opcional; pausa por votación; desconexión con piloto, a cubierto o eliminación.
- Abandonar, clasificación por orden de caída, ganador y pantalla de resultados.
- Instantáneas cada 10 s y al apagar: tras un reinicio la partida vuelve en pausa con el mismo mundo.
- **Sobrevuelo de la arena** al empezar: vista general, una vuelta en espiral sobre el mapa y descenso hasta tu sitio en el
  anillo; después, los Elegidos. Se corta si tocas el mapa y no se anima si el sistema pide menos movimiento.
- **Probada con 24 participantes** (sala llena, mapa grande, niebla, órdenes cada 1–2 s): tick p95 de 1,9 ms de los
  100 disponibles, respuesta a una orden p95 de 4 ms y unos 7 KB/s por jugador. La prueba encontró que cada orden
  forzaba un fotograma a todos los jugadores; ahora solo lo recibe a quien le cambia algo (de 18,6 a 8,5 fotogramas/s
  por jugador).

**Interfaz**
- Identidad visual propia («Ceniza y cristal») en todas las pantallas, incluidas la partida y la prueba de fuerza.
- Dos revisiones anti-IA con **unslop-ui**, **Impeccable**, **Taste Skill** y **create-game-assets**.

**Infraestructura**
- Monorepo (shared, engine, server, web), migraciones automáticas, modo producción con el frontend servido por Node.
- systemd con endurecimiento, health check con reinicio, copias diarias con rotación, restauración,
  actualizaciones con vuelta atrás automática, Caddy, Nginx y cloudflared.

## Pruebas ejecutadas (resultado real, última ejecución)

| Suite | Resultado | Cubre |
|---|---|---|
| Unitarias (`packages/shared`) | **23/23 ✔** | Costes, arquetipos, atributos con efecto real, defectos y rasgos, validación, fábrica de bots, RNG, configuración, códigos; y de la fase 5: efectos que apuntan a orígenes que existen, coste de terreno solo donde el distrito lo promete, visión por terreno y altura, noche y salud baja, tope de precisión, desglose idéntico al motor con builds al azar |
| Motor (`packages/engine`) | **35/35 ✔** | Las 18 de la fase 4 más 17 nuevas. Combate determinista, acercarse antes de golpear, esquiva, sorpresa, Último aliento, Golpe brutal, huida, tregua, detección, equilibrio dentro de ×0,5–×1,5, cada estilo con su terreno, prueba de fuerza. Y en partida: tabla de terrenos compartida, distrito VII en el bosque, distrito X en la roca, visión por terreno con niebla, partidas de la 0.4 recuperadas |
| Integración (`apps/server`, PostgreSQL real) | **44/44 ✔** | Cuentas, fotos, plantillas, lobby y partida (inicio, movimiento, pausa, reconexión, reinicio a mitad de partida, abandono) y la prueba de carga |
| Carga (`npm run load`, 30 s) | **✔** | 24 humanos en mapa grande con niebla, 489 órdenes sin rechazos. Tick p50/p95/máx. 0,19/1,91/11,9 ms; respuesta p95 4 ms; bucle de eventos p99 11,5 ms; 6,8 KB/s por jugador (máx. 9,7); al final, cada cliente ve exactamente lo que el servidor calcula para él |
| Extremo a extremo (Chrome real) | **1/1 ✔** | Dos usuarios (escritorio + móvil) del registro a la partida, con el desglose de estadísticas, la prueba de fuerza en escritorio y en móvil y el sobrevuelo de la arena |
| Compilación y tipos | ✔ | `tsc` en los 4 paquetes, build de servidor y web (con el worker de la prueba de fuerza) |
| Diseño (unslop-ui y detector de Impeccable) | **0 señales** | Sobre todas las pantallas |
| Producción | ✔ | Health, SPA y rutas internas, CSP, caché inmutable en los archivos con hash |
| Despliegue (simulado sin systemd) | ✔ | Usuario de servicio, `.env` con clave aleatoria, compilación, migraciones, health check, copia y restauración |

## Skills y plugins instalados para el desarrollo

| Skill o plugin | Para qué se usa |
|---|---|
| Impeccable, unslop-ui, Taste Skill | Diseño de la interfaz y detección de señales de IA |
| pixijs-skills (oficial de PixiJS) | Mapa ilustrado y personajes animados con PixiJS v8 (fase 7) |
| gamedev-agent-skills (8 skills) | IA de bots (fase 6), generación procedural y botín (fases 7–8), supervivencia y fabricación (fase 8), HUD, sensación de juego y cámara (fase 10), arte y personajes coherentes |
| transformers-js (oficial de Hugging Face) | Modelos en la GPU del navegador: personaje desde foto, retrato y modelos de bots en el anfitrión |
| anthropic-art-skills | Arte generativo con código (texturas, carteles, imagen para compartir salas) |
| openai-develop-web-game | Ciclo de pruebas con Playwright para el bucle de partida |
| Context Compactor, Concise Intuitive Answers | Gastar menos contexto en sesiones largas sin perder precisión |

## Funcionalidades pendientes

- **Fase 6:**
  - IA de bots con utility AI en el servidor: memoria y percepción idéntica a la de un humano.
  - Lo que necesite GPU en **la GPU del anfitrión de la sala**: modelo de lenguaje para el chat de los bots y
    red de decisión para Experto. Si no hay GPU, se vuelve a la IA del servidor.
- **Fase 7:**
  - Mapa ilustrado con PixiJS (relieve, ríos, caminos, rótulos, modo holograma), día y noche, exploración.
  - **Personajes animados en lugar de la foto:** esqueleto 2D, cinco direcciones dibujadas, todas las
    animaciones del GDD §5.9 y estados visibles.
  - Pasos de generación con GPU en el anfitrión.
- **Fase 8:** llevar el combate y la detección a la partida, más recursos, inventario, fabricación, alianzas y
  traiciones.
- **Fase 9:** eventos dinámicos y Director, zona segura y progresión.
- **Fase 10:**
  - Pantallas de partida, historial, logros y administración.
  - **Editor de apariencia amplio:** cuerpo, piel, cara, pelo, marcas, ropa por distrito, accesorios y poses.
  - **Crear el personaje desde una foto:** análisis en la GPU del jugador, asignación al catálogo y generación
    de las piezas que no existan, con control automático y guardado como «pieza generada».
- **Fase 12:** validar en tu VM real (systemd, ufw, túnel de Cloudflare con tu dominio).

## Errores y limitaciones conocidas

- El mapa de la partida es provisional: canvas 2D con biomas simples y un círculo con el retrato. La foto deja el
  mapa en la fase 7, cuando lleguen los personajes animados.
- Los bots y los desconectados en piloto solo deambulan; la IA de verdad es la fase 6.
- Sin combate en la partida todavía (las reglas ya existen en el motor): una partida solo termina por abandonos o
  desconexiones con la regla «eliminar».
- El simulador mide encuentros entre dos (o tres, con testigo), no partidas completas; eso llegará con los bots
  de la fase 6.
- La prueba de fuerza tiene un margen de ±5 puntos en cada casilla (80 combates) y de ±2 en las medias.
- El chat de sala durante la partida solo funciona con «Chat durante la partida: Todos» (las alianzas son fase 8).
- Las fotos HEIC dependen de que el navegador las abra (Safari sí; Chrome en Windows no, y avisa).
- El paquete JavaScript ocupa 667 KB (206 KB comprimido), más 124 KB del worker que solo se carga al abrir la
  prueba de fuerza. Se dividirá en trozos cuando llegue PixiJS.
- No hay panel de administración web todavía; existe `npm run admin:promote`.
- Las unidades systemd, ufw y Caddy no se han podido ejecutar aquí (el entorno no tiene systemd). Ver `docs/DEPLOYMENT.md` §9.

## Próximos pasos (sesión 4)

1. **Fase 7:** mapa ilustrado con PixiJS v8 sobre el mismo mundo y **personajes animados** con esqueleto 2D
   (primera tanda de piezas y animaciones de andar, correr y reposo), sustituyendo los círculos con foto.
2. **Fase 6:** utility AI sobre `computeView` y la política de combate del motor; reparto de trabajos a la GPU del
   anfitrión con vuelta a la CPU del servidor.
3. **Fase 8 (inicio):** medidores de supervivencia, búsqueda de recursos con los efectos de actividad ya
   definidos, e inventario.

## Cómo continuar en la próxima sesión

El código está en GitHub. `main` tiene la fase 4; la fase 5 llega por la rama `fase-5-estadisticas` (pull
request #2) y el cierre de la fase 4 por `fase-4-cierre` (pull request #3, que va encima de la #2). Al empezar la próxima sesión basta con decir que siga desde el repositorio.
