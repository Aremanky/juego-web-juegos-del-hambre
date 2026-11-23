# PROJECT_STATUS — Los Juegos de la Ceniza

**Versión:** 0.4.0 · **Última actualización:** 23/11/2026 (sesión 2, fase 4) · **Avance global: ~52 %**

El proyecto es ejecutable: se puede registrar, guardar fotos y personajes, crear salas, invitar por código o
enlace, preparar la partida con amigos y bots y **jugarla en tiempo real**: presentación de los participantes,
cuenta atrás en el anillo del Obelisco, mapa por semilla, movimiento con un toque, pausa por votación,
desconexiones con piloto automático y recuperación tras reiniciar el servidor. Todavía no hay combate,
recursos ni eventos (fases 7–9): una partida termina cuando los demás abandonan o quedan fuera por desconexión.

Código: [github.com/Aremanky/juego-web-juegos-del-hambre](https://github.com/Aremanky/juego-web-juegos-del-hambre).

## Avance por fase

| Fase | Contenido | Avance | Barra |
|---|---|---|---|
| 1 | Entorno, experiencia y mecánicas (GDD) | **100 %** | ██████████ |
| 2 | Arquitectura, estructura e infraestructura | **90 %** | █████████░ |
| 3 | Usuarios, salas, lobby, personajes, fotos persistentes | **100 %** | ██████████ |
| 4 | Motor multijugador y sincronización de partida | **90 %** | █████████░ |
| 5 | Estadísticas, habilidades y reparto de puntos | 60 % | ██████░░░░ |
| 6 | Bots autónomos e incorporación desde el lobby | 30 % | ███░░░░░░░ |
| 7 | Mapa, movimiento y exploración | 25 % | ██▌░░░░░░░ |
| 8 | Recursos, combates, alianzas y traiciones | 5 % | ▌░░░░░░░░░ |
| 9 | Eventos dinámicos y progresión | 5 % | ▌░░░░░░░░░ |
| 10 | Interfaz completa (26 pantallas) | 45 % | ████▌░░░░░ |
| 11 | Pruebas completas, optimización y errores | 35 % | ███▌░░░░░░ |
| 12 | Despliegue definitivo en Proxmox | 60 % | ██████░░░░ |

El avance global pondera cada fase por su esfuerzo estimado (F1 5 %, F2 7 %, F3 12 %, F4 12 %, F5 6 %, F6 12 %,
F7 12 %, F8 12 %, F9 7 %, F10 8 %, F11 4 %, F12 3 %). Las fases 6, 7 y 8 son las más pesadas que quedan.

Notas de reparto:
- **F4 (90 %)**: hecho el motor, el inicio, la sincronización, la pausa, las desconexiones, la persistencia y la
  recuperación. Falta una prueba de carga con 24 participantes y el sobrevuelo de la arena en la presentación.
- **F5 (60 %)**: la velocidad y la visión de la partida ya salen de los atributos. Falta aplicar el resto a las
  mecánicas de las fases 7–8 y las simulaciones de equilibrio.
- **F6 (30 %)**: incorporación desde el lobby completa y un piloto provisional que camina por la arena con la misma
  API que un humano. Falta la IA de decisión (Utility AI, memoria, percepción con `computeView`).
- **F7 (25 %)**: mapa por semilla con biomas y explanada central, A* con coste de terreno, movimiento interpolado y
  niebla de guerra. Falta el mapa ilustrado con PixiJS, ríos, caminos, puntos de interés y exploración.

## Funcionalidades completadas (probadas)

**Cuentas y sesiones**
- Registro e inicio de sesión; el primer usuario es administrador.
- Sesión recordada 30 días en el mismo navegador (cookie HttpOnly con renovación deslizante).
- Cerrar sesión, cerrar todas las sesiones, cambiar nombre y contraseña (cierra las demás sesiones).
- Código de registro opcional para servidores públicos.

**Biblioteca de fotografías (en el servidor)**
- Subida desde móvil u ordenador con normalización en el navegador (orientación EXIF; HEIC si el navegador lo abre).
- Recorte circular no destructivo: el original se conserva y se puede reajustar cuando quieras.
- Versiones generadas: retrato 512 px, marcador de mapa 160 px y miniatura.
- Nombre, etiquetas, foto predeterminada, borrado y límite por usuario.
- Validación real del archivo, límites de tamaño y de píxeles, archivos solo para usuarios autenticados, caché inmutable.

**Personajes**
- Sistema de 7 atributos con coste creciente, presupuesto 24/28/32 y +2 con defecto.
- 16 habilidades con requisitos, 10 rasgos (ventaja y contrapartida), 7 defectos, 12 distritos con ventaja propia.
- 8 arquetipos rápidos; comparación con arquetipos o personajes guardados (radar y estadísticas derivadas).
- Identidad: nombre, epíteto, género, distrito preferido, color, 6 marcos de marcador, retrato, foto de victoria y presentación.
- Estrategia de piloto automático (combate, umbral de huida, alianzas).
- Plantillas guardadas en el servidor, reutilizables entre sesiones y dispositivos (crear, editar, duplicar, borrar).

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
- Mapa por semilla (64², 96² o 128²): lagos, orillas, praderas, bosque, bosque denso, roca, montaña y cumbres,
  con la explanada del Obelisco en el centro.
- Mover con un toque: el servidor calcula la ruta con coste de terreno y la velocidad del personaje; el cliente la
  interpola sin saltos. Parar, arrastrar el mapa, zoom con rueda, pellizco o botones y «Centrar».
- Niebla de guerra opcional: solo ves a quien entra en tu radio de visión; de los demás nunca se ve su destino.
- Pausa por votación (mayoría o unanimidad, caduca a los 30 s) y reanudación cuando todos pulsan «Listo».
- Desconexión según la sala: piloto automático, a cubierto o eliminación tras los minutos de gracia.
- Abandonar la partida, clasificación por orden de caída, ganador y pantalla de resultados.
- Instantáneas cada 10 s y al apagar: tras un reinicio la partida vuelve en pausa con el mismo mundo.
- Registro de eventos de cada partida en la BD (base del historial y la cronología de la fase 10).

**Interfaz**
- Identidad visual propia («Ceniza y cristal») en inicio, acceso, menú, perfil, fotos, personajes, editor, salas,
  lobby, editor de bots y ahora la partida (mapa, presentación, cuenta atrás, pausa, votación y resultados).
- Dos revisiones anti-IA con **unslop-ui**, **Impeccable**, **Taste Skill** y **create-game-assets**: camafeos
  de perfil para los retratos generados, glifos propios, pigmentos apagados, sin degradados ni resplandores.

**Infraestructura**
- Monorepo (shared, engine, server, web), migraciones automáticas, modo producción con el frontend servido por Node.
- systemd con endurecimiento, health check con reinicio, copias diarias con rotación, restauración,
  actualizaciones con vuelta atrás automática, Caddy, Nginx y cloudflared.

## Pruebas ejecutadas (resultado real, última ejecución)

| Suite | Resultado | Cubre |
|---|---|---|
| Unitarias (`packages/shared`) | **16/16 ✔** | Costes, arquetipos, atributos con efecto real, defectos y rasgos, validación, fábrica de bots, RNG reanudable, configuración, códigos |
| Motor (`packages/engine`) | **18/18 ✔** | Mapa determinista, codificación, A* contiguo y óptimo, tiempos por terreno, sin teletransportes, determinismo con intenciones, instantánea restaurada idéntica, piloto, pausa que congela el reloj, abandono y ganador, políticas de desconexión, votaciones, reinicio en pausa, niebla de guerra, rutas ajenas recortadas |
| Integración (`apps/server`, PostgreSQL real) | **42/42 ✔** | Las 33 de cuentas, fotos, plantillas y lobby, más 9 de partida: inicio automático, inicio forzado, sin entradas tardías, movimiento validado, chat según la sala, pausa y reanudación, reconexión con piloto, **reinicio del servidor a mitad de partida**, abandono con ganador y registro en BD |
| Extremo a extremo (Chrome real) | **1/1 ✔** | Dos usuarios (escritorio + móvil) del registro a la partida: lobby, bots, plazas, chat, recarga, inicio automático, presentación, cuenta atrás, mover con un toque, pausa por votación, recarga en plena partida y abandono |
| Compilación y tipos | ✔ | `tsc` en los 4 paquetes, build de servidor y web |
| Diseño (unslop-ui y detector de Impeccable) | **0 señales** | Sobre todas las pantallas, incluida la partida |
| Producción | ✔ | Health, SPA y rutas internas, CSP, caché inmutable en los archivos con hash |
| Despliegue (simulado sin systemd) | ✔ | Usuario de servicio, `.env` con clave aleatoria, compilación, migraciones, health check, copia y restauración |

## Skills instaladas para el desarrollo

| Skill | Para qué se usará |
|---|---|
| Impeccable, unslop-ui, Taste Skill | Diseño de la interfaz y detección de señales de IA |
| pixijs-skills (oficial de PixiJS) | Mapa ilustrado de la arena con PixiJS v8 (fase 7) |
| gamedev-agent-skills (8 skills) | IA de bots (fase 6), generación procedural y botín (fases 7–8), supervivencia y fabricación (fase 8), HUD, sensación de juego y cámara (fase 10), arte coherente |
| transformers-js (oficial de Hugging Face) | Retrato con IA en la GPU del navegador (fase 10) |
| anthropic-art-skills | Arte generativo con código (texturas, carteles, imagen para compartir salas) |
| openai-develop-web-game | Ciclo de pruebas con Playwright para el bucle de partida |

## Funcionalidades pendientes

- **Fase 4:** prueba de carga con 24 participantes y sobrevuelo de la arena en la presentación.
- **Fase 5:** aplicar estadísticas al resto de mecánicas y simulaciones de equilibrio.
- **Fase 6:** IA de bots (Utility AI, memoria, percepción idéntica a la de un humano, diálogo).
- **Fases 7–9:** mapa ilustrado con PixiJS (relieve, ríos, caminos, rótulos, modo holograma), día y noche,
  exploración, inventario, fabricación, combate, alianzas, traiciones, eventos y Director, zona segura.
- **Fase 10:** inventario, combate, alianzas, eventos, historial, logros, administración y **retrato con IA en la
  GPU del navegador**.
- **Fase 12:** validar en tu VM real (systemd, ufw, túnel de Cloudflare con tu dominio).

## Errores y limitaciones conocidas

- El mapa de la partida es básico (canvas 2D con biomas y árboles simples); el ilustrado llega en la fase 7.
- Los bots y los desconectados en piloto solo deambulan; la IA de verdad es la fase 6.
- Sin combate todavía: una partida solo termina por abandonos o desconexiones con la regla «eliminar».
- El chat de sala durante la partida solo funciona con «Chat durante la partida: Todos» (las alianzas son fase 8).
- Las fotos HEIC dependen de que el navegador las abra (Safari sí; Chrome en Windows no, y avisa).
- El paquete JavaScript ocupa 655 KB (202 KB comprimido). Se dividirá en trozos cuando llegue PixiJS.
- No hay panel de administración web todavía; existe `npm run admin:promote`.
- Las unidades systemd, ufw y Caddy no se han podido ejecutar aquí (el entorno no tiene systemd). Ver `docs/DEPLOYMENT.md` §9.

## Próximos pasos (sesión 3)

1. Fase 7: mapa ilustrado con PixiJS v8 sobre el mismo mundo (relieve sombreado, ríos y caminos en el generador,
   puntos de interés con nombre, rótulos, modo cartográfico y holograma), día y noche, exploración y regiones.
2. Fase 6: IA de bots con utility AI sobre `computeView` (misma percepción que un humano), memoria y dificultad
   como calidad de decisión; sustituye al piloto provisional.
3. Fase 8 (inicio): medidores de supervivencia, búsqueda de recursos e inventario.
4. Prueba de carga de la fase 4 con 24 clientes simulados.

## Cómo continuar en la próxima sesión

El código está en GitHub: `main` tiene la versión 0.3.2 y la fase 4 llega por la rama `fase-4-motor-de-partida`
(pull request). Al empezar la próxima sesión basta con decir que siga desde el repositorio.
