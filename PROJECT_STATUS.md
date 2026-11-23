# PROJECT_STATUS — Los Juegos de la Ceniza

**Versión:** 0.3.2 · **Última actualización:** 23/11/2026 (sesión 1, con dos revisiones de diseño anti-IA) · **Avance global: ~39 %**

El proyecto es ejecutable: se puede registrar, guardar fotos y personajes, crear salas, invitar por código o
enlace y preparar la partida en tiempo real con amigos y bots. **Aún no se puede jugar la partida**: el
motor de la arena es la fase 4.

## Avance por fase

| Fase | Contenido | Avance | Barra |
|---|---|---|---|
| 1 | Entorno, experiencia y mecánicas (GDD) | **100 %** | ██████████ |
| 2 | Arquitectura, estructura e infraestructura | **90 %** | █████████░ |
| 3 | Usuarios, salas, lobby, personajes, fotos persistentes | **100 %** | ██████████ |
| 4 | Motor multijugador y sincronización de partida | 15 % | █▌░░░░░░░░ |
| 5 | Estadísticas, habilidades y reparto de puntos | 60 % | ██████░░░░ |
| 6 | Bots autónomos e incorporación desde el lobby | 25 % | ██▌░░░░░░░ |
| 7 | Mapa, movimiento y exploración | 5 % | ▌░░░░░░░░░ |
| 8 | Recursos, combates, alianzas y traiciones | 5 % | ▌░░░░░░░░░ |
| 9 | Eventos dinámicos y progresión | 5 % | ▌░░░░░░░░░ |
| 10 | Interfaz completa (26 pantallas) | 35 % | ███▌░░░░░░ |
| 11 | Pruebas completas, optimización y errores | 25 % | ██▌░░░░░░░ |
| 12 | Despliegue definitivo en Proxmox | 60 % | ██████░░░░ |

El avance global pondera cada fase por su esfuerzo estimado (F1 5 %, F2 7 %, F3 12 %, F4 12 %, F5 6 %, F6 12 %,
F7 12 %, F8 12 %, F9 7 %, F10 8 %, F11 4 %, F12 3 %). Las fases 4, 6, 7 y 8 son las más pesadas que quedan.

Notas de reparto:
- **F4 (15 %)**: ya está la base reutilizable (Socket.IO autenticado, confirmaciones, límites, estado filtrado
  por jugador, reconexión, multidispositivo, persistencia y recuperación tras reinicio). Falta el bucle de partida.
- **F5 (60 %)**: sistema completo de atributos, coste creciente, fórmulas derivadas, habilidades, rasgos,
  defectos, distritos, validación en servidor y editor visual con comparación. Falta aplicarlo a las mecánicas
  de partida (fases 7–8) y las simulaciones de equilibrio.
- **F6 (25 %)**: incorporación desde el lobby completa (cualquiera añade, límites, idempotencia, edición por
  todos, generación equilibrada por personalidad). Falta la IA de decisión (Utility AI, memoria, percepción).

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
- Vista previa en ficha, en el mapa y en la clasificación.
- Plantillas guardadas en el servidor, reutilizables entre sesiones y dispositivos (crear, editar, duplicar, borrar).

**Salas y lobby en tiempo real**
- Crear sala con configuración completa (incluida duración ilimitada); unirse por código o por enlace `/r/CÓDIGO`.
- Tablero de distritos (12 × 2 plazas) con unicidad garantizada en memoria y en BD, también ante peticiones simultáneas.
- Al entrar se carga solo tu último personaje (o el que tenías en esa sala).
- Lista de participantes con presencia, indicador de preparados, humano/bot y quién añadió cada bot.
- «+ AÑADIR BOT» para cualquier participante; límites total y por persona; sin duplicados por doble clic ni carreras.
- Edición de bots por cualquiera (identidad, cara, dificultad, personalidad, estilo, atributos, habilidades), regenerar
  y retirar (quien lo añadió o el anfitrión).
- Prioridad humana: si la sala está llena, el humano que entra sustituye al último bot.
- Anfitrión: configurar, expulsar (sin posibilidad de volver), ceder el puesto; traspaso automático si se desconecta.
- Salida voluntaria; la sala se cierra al quedar sin humanos.
- Reconexión automática, varios dispositivos por usuario, persistencia y recuperación tras reiniciar el servidor.
- Chat global y de sala, con historial.
- La build de cada humano es secreta para los demás.

**Interfaz**
- Identidad visual propia («Ceniza y cristal»): inicio, acceso, menú, perfil, fotos, personajes, editor,
  crear y unirse a sala, lobby y editor de bots. Adaptada a móvil (pestañas en el lobby) y a escritorio.
- Revisión anti-IA con las skills **unslop-ui**, **Impeccable** y **Taste Skill**: sin degradados en el texto, sin
  resplandores de neón, sin barras de color en un solo lado de las cajas, botón principal sólido, etiquetas sin
  forma de píldora, portada en dos columnas con el producto real (el tablero) en lugar del héroe centrado,
  contraste del texto tenue ≥4,5:1, barras de desplazamiento y cursor tematizados, y textos sin fórmulas genéricas.
- Segunda revisión (con **create-game-assets** y la crítica de **Impeccable**):
  - Retratos generados rehechos como **camafeos de perfil** (relieve en hueso sobre el color del jugador, nueve
    peinados), legibles a 30 px y distintos de las fotos de los amigos.
  - Fuera los iconos de serie de los botones con texto y de atributos, habilidades y rasgos; glifos propios en la
    navegación del móvil y un punto de conexión en lugar del icono de wifi.
  - Colores de distrito y de jugador pasados a pigmentos apagados; atributos en oro con color por tramo de coste.
  - Encabezados de sección en Archivo (Cinzel solo para títulos, nombres y numerales), esquinas de visor solo en el
    tablero, fondo de hollín sin degradados y curvas de nivel turquesas en la vista previa del mapa.

**Infraestructura**
- Monorepo (shared, server, web), migraciones automáticas, modo producción con el frontend servido por Node.
- systemd con endurecimiento, health check con reinicio, copias diarias con rotación, restauración,
  actualizaciones con vuelta atrás automática, Caddy, Nginx y cloudflared.

## Pruebas ejecutadas (resultado real, última ejecución)

| Suite | Resultado | Cubre |
|---|---|---|
| Unitarias (`packages/shared`) | **16/16 ✔** | Costes, arquetipos, que ningún atributo sea decorativo (cada uno cambia ≥3 derivadas), defectos y rasgos, validación, fábrica de bots en las 180 combinaciones, RNG reanudable, configuración, códigos |
| Integración (`apps/server`, PostgreSQL real) | **33/33 ✔** | Registro, duplicados, login, logout, cambio de contraseña, CSRF, código de registro; fotos (subida, límite de 2048 px, recorte con versión nueva, 304, 415, 413, permisos, predeterminada, borrado); plantillas (CRUD, versión de foto, persistencia entre sesiones, build inválida, foto ajena) |
| Multicliente (sockets reales) | incluido arriba | Unión de 2+ clientes, plantilla automática, build privada, carrera por la misma plaza, nombres únicos, doble clic, oleadas simultáneas de 2 usuarios contra los límites, idempotencia, edición y retirada de bots con permisos, preparados, reequilibrado al cambiar puntos, multidispositivo, desconexión y reconexión, chat, expulsión sin retorno, traspaso de anfitrión, **reinicio del servidor con la sala intacta**, salida y cierre, prioridad humana |
| Extremo a extremo (Chrome real) | **1/1 ✔** | Dos usuarios a la vez (escritorio + móvil): registro, subir y recortar foto, crear plantilla, crear sala, invitación por enlace, bots añadidos por la invitada y editados por el anfitrión (visible al instante), personaje en sala, plaza, preparados, chat, recarga con reconexión, sesión recordada |
| Compilación y tipos | ✔ | `tsc` en los 3 paquetes, build de servidor y web |
| Diseño (escáner de unslop-ui y detector de Impeccable) | **0 señales** (antes 12 y 2) | Degradados, resplandores, píldoras, rebotes, rejillas decorativas; más revisión visual de las 12 capturas y QA de los camafeos con `asset_report.py` |
| Producción | ✔ | Health, SPA y rutas internas, CSP, caché inmutable en los archivos con hash |
| Despliegue (simulado sin systemd) | ✔ | Usuario de servicio, `.env` con clave aleatoria, `npm ci` y compilación, migraciones, arranque como `ceniza`, health check, copia de seguridad y restauración verificada |

## Skills instaladas para el desarrollo

| Skill | Para qué se usará |
|---|---|
| Impeccable, unslop-ui, Taste Skill | Diseño de la interfaz y detección de señales de IA |
| pixijs-skills (oficial de PixiJS) | Mapa ilustrado de la arena con PixiJS v8 (fase 7) |
| gamedev-agent-skills (8 skills) | IA de bots con utility AI, percepción y rutas (fase 6); generación procedural y botín (fases 7–8); supervivencia y fabricación (fase 8); HUD, sensación de juego y cámara (fase 10); arte y personajes coherentes |
| transformers-js (oficial de Hugging Face) | Retrato con IA en la GPU del navegador (fase 10) |
| anthropic-art-skills | Arte generativo con código (texturas, carteles, imagen para compartir salas) |
| openai-develop-web-game | Ciclo de pruebas con Playwright para el bucle de partida (fases 4 y 7) |

No se han instalado generadores de imágenes por IA externos: son de pago, rompen la regla de no depender de
servicios externos y su resultado se reconoce como IA.

## Funcionalidades pendientes

- **Fase 4:** inicio de partida, bucle autoritativo, sincronización de partida, pausa por votación y
  políticas de desconexión en partida, persistencia de partidas.
- **Fase 5:** aplicar estadísticas en mecánicas y simulaciones de equilibrio.
- **Fase 6:** IA de bots (Utility AI, memoria, percepción idéntica a la de un humano, diálogo).
- **Fases 7–9:** mapa procedural ilustrado (PixiJS), movimiento, exploración, inventario, fabricación, combate,
  alianzas, traiciones, eventos y Director, zona segura.
- **Fase 10:** pantallas de partida (mapa, inventario, combate, alianzas, eventos, clasificación, eliminación,
  victoria), historial, logros, administración y **retrato con IA en la GPU del navegador**.
- **Fase 12:** validar en tu VM real (systemd, ufw, túnel de Cloudflare con tu dominio).

## Errores y limitaciones conocidas

- Con todos preparados, el lobby muestra «Todos preparados», pero no hay botón de inicio hasta la fase 4. Es
  intencionado: no se dejan botones sin funcionalidad.
- Las fotos HEIC dependen de que el navegador las abra (Safari sí; Chrome en Windows no, y muestra un aviso claro).
  Desde el iPhone se convierten solas a JPG al subirlas.
- El paquete JavaScript ocupa 648 KB (199 KB comprimido). Se dividirá en trozos cuando llegue el mapa.
- No hay panel de administración web todavía; existe `npm run admin:promote`.
- Las unidades systemd, ufw y Caddy no se han podido ejecutar aquí (el entorno no tiene systemd). Ver `docs/DEPLOYMENT.md` §9.

## Próximos pasos (sesión 2: fase 4)

1. `packages/engine`: estado del mundo serializable, tick a 10 Hz, cola de intenciones, PRNG con estado.
2. Inicio de partida desde el lobby (automático o forzado), asignación de plazas libres, cuenta atrás y presentación.
3. Protocolo de partida: instantánea al entrar, deltas a 5 Hz, segmentos de movimiento, vista por jugador (`computeView`).
4. Tablas `matches`, `match_participants`, `match_events`; instantáneas periódicas y recuperación tras reinicio (en pausa).
5. Pausa por votación y reanudación cuando todos estén listos; políticas de desconexión.
6. Generador de mapa básico para validar el movimiento sincronizado (el ilustrado completo llega en la fase 7).
7. Pruebas: sincronización con varios clientes, reconexión a mitad de partida, reinicio del servidor durante una partida.

## Cómo continuar en la próxima sesión

El código no se conserva entre sesiones de Claude por sí solo. Para seguir:
- **Opción recomendada:** conecta GitHub en claude.ai (Ajustes → Conectores) y crea un repositorio privado (p. ej.
  `juegos-ceniza`); así podré subir y retomar el código directamente.
- **Alternativa:** adjunta al empezar el `.tar.gz` entregado al final de esta sesión.
