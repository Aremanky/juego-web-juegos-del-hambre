# PROJECT_STATUS — Los Juegos de la Ceniza

**Versión:** 0.6.4 · **Última actualización:** 24/11/2026 (sesión 5: correcciones de la revisión y mapa a 60 fps) · **Avance global: ~73 %**

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

Desde la 0.6.2 (cierre de la fase 6):
- **Los bots hablan:** frases cortas según su carácter y lo que pasa (al empezar, al acechar o huir de
  alguien, al anochecer, al caer otro, al ganar), en un bocadillo sobre su cabeza y en el registro. Solo las
  oye quien los ve y, con el chat de partida desactivado, se callan.
- **El estilo de juego cuenta:** el cazador acecha más, el superviviente se esconde y espera, el saqueador
  corre al Obelisco y explora.
- **Juego limpio:** contra un humano, un bot ya no usa su build secreta para calcular si le gana.
- **Sin tirón al empezar:** la IA baja de 1,8 a 0,8 ms de media por tick, y el arranque de cada partida, de
  hasta 73 ms a 16 ms como mucho.
- **Los bots no van a las GPU de los clientes:** medido, el servidor va sobrado. El GDD (§13) dice cuándo
  convendría retomarlo.

Desde la 0.6.3 (cierre de la fase 7):
- **Personajes en ocho rumbos:** vistas de 3/4 de frente y de espaldas además de frente, lado y espalda. Trepan
  en las montañas y, si alguien cae delante de ti, la caída se ve y queda tumbado y en gris.
- **Tarjeta del participante:** toca a alguien en el mapa o en la lista de participantes. Dice quién es, cómo
  está y dónde está para ti (casillas y tiempo, o desde cuándo no lo ves), con «Ir hacia aquí». En el móvil
  sale como hoja abajo.
- **Ruta y tiempo antes de moverte:** con ratón, al pasar por encima; con el dedo, el primer toque la enseña y
  el segundo (o «Ir») va. Es el mismo cálculo que hace el servidor.
- **«Visto por última vez»:** quien sale de tu vista deja una marca con su nombre y desde cuándo, que se apaga
  en dos minutos.
- **Mapa mucho más ligero sin GPU:** con 24 personajes (8 de ellos caídos), de noche y con niebla, el mapa no
  llegaba a 3 fotogramas por segundo: el gris de los caídos se hacía con un filtro que sin GPU cuesta muchísimo.
  Sin ese filtro, el resto de medidas llevan el móvil de 11 a 45–50 fotogramas por segundo y el escritorio de
  16 a unos 34, con la CPU 4 veces más lenta. PixiJS no hace falta (GDD §18).
- **Teclado y contraste:** la lista de participantes se recorre con el teclado y abre la tarjeta; el texto de la
  tarjeta pasa de 4,5:1 sobre cualquier terreno.

Desde la 0.6.4 (revisión y rendimiento):
- **El mapa va a 60 fps** sin GPU en un equipo normal (escritorio y móvil). El cuello de botella era la
  cabecera difuminada y una capa de grano encima de toda la pantalla, no el dibujo del mapa. Los «30 fps» de
  antes eran de la prueba E2E con los dos jugadores dibujando a la vez en el mismo Chrome.
- **Integración continua** en GitHub: tipos, pruebas, build y E2E en cada subida y en cada PR.
- La prueba E2E vuelve a pasar (se había quedado con los avisos de antes de la fase 7).
- Los nombres de los lugares ya no viajan en los datos antes de descubrirlos.
- Montañas en macizos según la altura, y en el móvil el aviso y los rótulos ya no se pisan.

Todavía no hay combate en la partida, ni recursos ni eventos (fases 8–9).

Código: [github.com/Aremanky/juego-web-juegos-del-hambre](https://github.com/Aremanky/juego-web-juegos-del-hambre).

## Avance por fase

| Fase | Contenido | Peso | Avance | Barra |
|---|---|---|---|---|
| 1 | Entorno, experiencia y mecánicas (GDD) | 4 % | **100 %** | ██████████ |
| 2 | Arquitectura, estructura e infraestructura | 6 % | **95 %** | █████████▌ |
| 3 | Usuarios, salas, lobby, personajes, fotos persistentes | 11 % | **100 %** | ██████████ |
| 4 | Motor multijugador y sincronización de partida | 11 % | **100 %** | ██████████ |
| 5 | Estadísticas, habilidades y reparto de puntos | 6 % | **100 %** | ██████████ |
| 6 | Bots autónomos (IA en el servidor y en la GPU del anfitrión) | 11 % | **85 %** | ████████▌░ |
| 7 | Mapa ilustrado, personajes animados, movimiento y exploración | 14 % | **100 %** | ██████████ |
| 8 | Recursos, combates, alianzas y traiciones | 11 % | 15 % | █▌░░░░░░░░ |
| 9 | Eventos dinámicos y progresión | 6 % | 5 % | ▌░░░░░░░░░ |
| 10 | Interfaz completa, personalización amplia y personaje desde foto | 13 % | 45 % | ████▌░░░░░ |
| 11 | Pruebas completas, optimización y errores | 4 % | 60 % | ██████░░░░ |
| 12 | Despliegue definitivo en Proxmox | 3 % | 60 % | ██████░░░░ |

Los pesos se recalcularon en esta sesión al ampliar el alcance de las fases 7 y 10 (personajes animados,
personalización amplia, personaje desde foto y GPU del anfitrión).

Notas de reparto:
- **F6 (85 %)**: hecho todo lo que la fase puede hacer sin los sistemas de la 8:
  - utility AI con personalidad, dificultad y estilo de juego;
  - percepción igual a la de un humano, memoria que se olvida y estimaciones sin builds secretas;
  - estimación de combates con el motor real, sin tirón al empezar;
  - las decisiones de la arena actual;
  - frases por personalidad y situación, con bocadillos;
  - piloto automático para desconectados.

  Falta comer, beber, fabricar, aliarse, atacar y traicionar, y decir las frases de esas situaciones (ya
  escritas): llegan con esos sistemas en la fase 8. Repartir los bots entre las GPU de los clientes se ha
  descartado con medidas; los modelos en la GPU del anfitrión (chat con lenguaje, red para Experto) siguen
  siendo opcionales.
- **F7 (100 %)**: generador completo, regiones y exploración, día y noche con efecto en la visión, mapa
  ilustrado (rehecho en la 0.6.1), holograma, personajes animados en ocho rumbos con trepar y caer, tarjeta
  del participante, ruta y tiempo antes de moverse, «visto por última vez» y el dibujo abaratado con medidas
  (sin PixiJS). Lo que depende de otras fases pasa a ellas: las animaciones y estados de acciones que aún no
  existen (atacar, buscar, fabricar, comer, herido, envenenado, esconderse) y la salud y alianzas en la
  tarjeta, a la 8; los cambios del mapa por eventos y sus capas, a la 9.

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
- Probada con 24 humanos: tick p95 de 2,5 ms y 5,6 KB/s por jugador (`docs/LOAD.md`, 0.6.4).

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
- El estilo de juego modula sus decisiones: el cazador acecha más, el superviviente se esconde y espera, el
  saqueador corre al Obelisco y explora.
- Contra un humano estiman con una build supuesta (la media con su distrito), nunca con la suya secreta.
- Hablan según su carácter y lo que pasa, en bocadillos sobre su cabeza y en el registro. Solo los oye quien
  los ve (y, si nombran a alguien, quien también le ve); con el chat de partida desactivado, se callan. Los
  bocadillos no se pisan ni tapan caras.
- Coste medido con 23 bots en el mapa grande: 0,8 ms de media por tick, p95 3,5 ms, p99 6,9 ms; arranque de
  cada partida, 16 ms como mucho.

**Arena completa (fase 7, cerrada en la 0.6.3)**
- Personajes en ocho rumbos (cinco vistas dibujadas y tres en espejo), trepar en montaña y cumbre, y caída
  de 700 ms con los caídos en gris (sin animación con «reducir movimiento»).
- Tarjeta del participante desde el mapa o la lista (retrato, distrito, humano o bot, estado si dice algo,
  dónde está para ti e «Ir hacia aquí»), como diálogo no modal: foco al abrir, Esc y vuelta del foco.
- Ruta y tiempo previstos antes de moverse (ratón al pasar; dedo con dos toques o el botón «Ir»), con el
  mismo `planRoute` que el servidor y aviso si está demasiado lejos.
- «Visto por última vez» en el cliente: marca con nombre y «hace …» que se apaga en dos minutos.
- Dibujo más ligero sin GPU: gris sin filtro, terreno sin escalar (zoom en reposo en píxeles enteros por
  casilla), niebla en recorte, figuras guardadas como imagen por fotograma y densidad que baja sola si los
  fotogramas van lentos.
- Generador por semilla con relieve, lagos, pantanos, 2–3 ríos que bajan de manantiales de montaña,
  6–10 puntos de interés con nombre y caminos desde la explanada, con vados en los ríos.
- Regiones con el nombre de su punto de interés. Al entrar en una se descubre: aparece su nombre en tu mapa y
  «Has llegado a…» solo te lo dice a ti. El panel lleva la cuenta de lo descubierto.
- Día y noche por ritmo de sala (8 + 4 min en Estándar): de noche se ve menos (×0,6 con las ventajas de cada
  personaje), el mapa se oscurece y un reloj indica cuánto falta para el cambio.
- Mapa ilustrado (rehecho en la 0.6.1), pintado por bloques a la resolución del zoom:
  - suelo continuo con bordes de bioma naturales y relieve sombreado;
  - orillas con espuma, ríos que se ensanchan y caminos curvos, explanada empedrada;
  - árboles, coníferas, rocas, montañas y juncos sin rejilla; casas con pozo, ruinas, cuevas, manantiales y
    braseros; todo con la misma luz y sombras al sureste;
  - Obelisco con brasa y pavesas; de noche, ventanas, braseros y brasa encendidos;
  - rótulos con halo de los lugares conocidos.
  
  El botón «Holograma» cambia a curvas turquesas con la retícula de sectores A–L por 1–12.
- Personajes animados en lugar de la foto:
  - figura de proporciones de juego con sombreado y contorno, vistas de frente, espalda y lado;
  - reposo, andar, correr, nadar, agacharse en la maleza, caído y celebración;
  - anillo del color del jugador, punteado si va con piloto automático;
  - apariencia elegida en la pestaña Apariencia del editor (o derivada del retrato).
- 60 fps en el banco del mapa sin GPU (0.6.4): ver «Rendimiento del mapa» en las pruebas.

**Interfaz e infraestructura**
- Identidad visual «Ceniza y cristal» en todas las pantallas; revisiones anti-IA sin señales.
- Monorepo (shared, engine, server, web), systemd, copias, actualizaciones con vuelta atrás, Caddy, Nginx y
  cloudflared.

## Pruebas ejecutadas (resultado real, última ejecución)

| Suite | Resultado | Cubre |
|---|---|---|
| Unitarias (`packages/shared`) | **34/34 ✔** (0.6.4) | Reglas de personaje, efectos según la situación, desglose idéntico al motor; apariencia elegida y camafeo; catálogo de frases y su reparto |
| Motor (`packages/engine`) | **67/67 ✔** (0.6.4) | Generador, día y noche, exploración (en la 0.6.4, también que el nombre de un lugar solo viaja a quien lo ha descubierto), IA y su presupuesto por partida, frases, ruta prevista igual a la del servidor, combate y equilibrio |
| Cliente (`apps/web`) | **67/67 ✔** (0.6.4) | Rumbos, vistas de 3/4 y espejo, caídas, selección bajo el dedo, «visto por última vez», tarjeta, ruta prevista, niebla, bocadillos y densidad adaptativa (en la 0.6.4, que baje por debajo de ~50 fps y llegue a 0,75 en pantallas de densidad 1) |
| Integración (`apps/server`, PostgreSQL real) | **49/49 ✔** (0.6.4) | Salas, partida, niebla, pausa, reconexión, arena con bots, frases repartidas solo a quien ve al bot y movimiento solo para su dueño |
| Carga (`npm run load`, 30 s) | **✔** (0.6.4) | 24 humanos, mapa grande con niebla: tick p95 2,5 ms, respuesta p95 4 ms, 5,6 KB/s por jugador |
| Extremo a extremo (Chrome real) | **1/1 ✔** (0.6.4) | Del registro a la partida en escritorio y móvil, con el mapa, la apariencia, el reloj de día, el holograma, la noche y los fps de cada jugador con la página del otro congelada (39–55 según la ejecución: la máquina de pruebas tiene 2 núcleos y también ejecuta el servidor y los bots; con un solo jugador en la máquina, 54–60) |
| Compilación y tipos | ✔ (0.6.4) | `tsc` en los 4 paquetes con `noUnusedLocals` y `noUnusedParameters`, build de servidor y web |
| Rendimiento del mapa (banco: Chrome sin GPU, 24 personajes con 8 caídos, noche, niebla y bocadillos) | **✔** (0.6.4) | CPU normal: 60 fps en escritorio 1280×720 y en móvil 390×844. CPU 4 veces más lenta, ya asentado: 57 en escritorio (densidad 0,75) y 60 en móvil (densidad 1) |
| Rendimiento de la IA (23 bots, mapa grande, 5 min) | **✔** (0.6.2) | 0,8 ms de media por tick, p95 3,5 ms, p99 6,9 ms; arranque de cada partida ≤ 16 ms una vez caliente; hash del informe de equilibrio sin cambios |
| Diseño (unslop-ui y detector de Impeccable) | **0 señales** | Todas las pantallas en la 0.6.0; en la 0.6.1, el detector sobre la pestaña Apariencia; en la 0.6.2, los bocadillos con el suelo de oficio de Impeccable y capturas a 1280×720 y 390×844 de día, de noche y en holograma; en la 0.6.3, ocho rumbos, caída, ruta prevista, marcas, tarjeta y barra «Ir» en dos rondas de capturas, revisión de diseño y de accesibilidad (contraste medido sobre cinco terrenos, tabulador, 320 px y muesca) |
| Integración continua | ✔ (0.6.4) | `.github/workflows/pruebas.yml`: tipos, pruebas, build y E2E en cada subida a `main` y en cada PR |
| Producción | ✔ (0.6.4) | Build del servidor y de la web servidos juntos por Fastify en la prueba E2E |

## Skills y plugins instalados para el desarrollo

| Skill o plugin | Para qué se usa |
|---|---|
| Impeccable, unslop-ui, Taste Skill | Diseño de la interfaz y detección de señales de IA |
| pixijs-skills (oficial de PixiJS) | No hace falta por ahora: medido en la 0.6.3, el lienzo 2D abaratado cumple (GDD §18) |
| gamedev-agent-skills (8 skills) | Utility AI de los bots (fase 6), generación procedural, supervivencia, HUD y arte coherente |
| transformers-js (oficial de Hugging Face) | Modelos en la GPU del navegador: personaje desde foto y modelos de bots en el anfitrión |
| anthropic-art-skills | Arte generativo con código |
| openai-develop-web-game | Ciclo de pruebas con Playwright para el bucle de partida |
| Context Compactor, Concise Intuitive Answers | Gastar menos contexto en sesiones largas sin perder precisión |
| Superpowers, UI Design Review y Design (plugins) | Plan por tareas con pruebas primero y revisión del diseño y la accesibilidad (bocadillos de la 0.6.2; tarjeta y barra «Ir» de la 0.6.3) |
| SpriteCook (plugin) | Hojas de sprites pintados para los objetos del mapa (plan gratuito: 40 créditos, quedan 24) |

## Funcionalidades pendientes

- **Fase 6:** comer, beber, fabricar, aliarse, atacar y traicionar, y decir las frases de esas situaciones (ya
  escritas), con los sistemas de la fase 8. Opcional: modelos en la GPU del anfitrión.
- **Fase 8:** combate en la partida, medidores de supervivencia, recursos, inventario, fabricación, alianzas y
  traiciones, y que los bots los usen. Con ellos, sus animaciones y estados en el personaje (atacar, buscar,
  fabricar, comer y beber, herido, envenenado, agotado, esconderse) y, en la tarjeta, la salud si es visible
  y las alianzas.
- **Fase 9:** eventos dinámicos y Director, zona segura y progresión; los cambios del mapa por eventos y las
  capas de peligros y eventos.
- **Fase 10:** pantallas de partida, historial, logros, administración, ampliar el editor de apariencia (cara,
  marcas, barba, más prendas) y creación del personaje desde una foto con generación de piezas.
- **Pase visual:** descargar las dos hojas de SpriteCook a `apps/web/public/map/` y recortarlas con
  `scripts/slice-sheets.py` (el entorno de Claude no puede descargar de `api.spritecook.ai`).
- **Fase 12:** validar en tu VM real (systemd, ufw, túnel de Cloudflare con tu dominio).

## Errores y limitaciones conocidas

- Sin combate en la partida todavía: los bots acechan y huyen, pero nadie ataca. Una partida solo termina por
  abandonos o desconexiones con la regla «eliminar».
- Los objetos del mapa se dibujan en vectorial hasta que estén las hojas de SpriteCook en `public/map/`.
- Sin GPU y en un equipo lento, el mapa baja su densidad para mantener los fps: en pantallas de densidad 1
  puede llegar a 0,75 y se ve algo más suave. No vuelve a subir en esa partida.
- Las animaciones de las figuras van a pasos (unos 21 fotogramas por segundo andando) para poder guardarlas
  como imagen.
- Moverse por el mapa solo se puede con ratón o dedo; la ruta prevista y su aviso no se anuncian a los lectores
  de pantalla. Esc cierra la tarjeta aunque el foco esté en el chat.
- En escenas muy llenas en un móvil (cuatro bocadillos a la vez en poco espacio), un bocadillo puede tapar el
  nombre y las piernas de otro bot, nunca la cara. La frase sigue en el registro.
- La prueba de fuerza tiene un margen de ±5 puntos en cada casilla y de ±2 en las medias.
- El chat de sala durante la partida solo funciona con «Chat durante la partida: Todos».
- Las fotos HEIC dependen de que el navegador las abra (Safari sí; Chrome en Windows no, y avisa).
- No hay panel de administración web todavía; existe `npm run admin:promote`.
- systemd, ufw y Caddy no se han podido ejecutar aquí (el entorno no tiene systemd). Ver `docs/DEPLOYMENT.md` §9.

## Próximos pasos (sesión 6)

1. **Fase 8:** combate en la partida con el motor de la fase 5 (atacar, emboscar, huir), medidores de
   supervivencia, búsqueda de recursos con los efectos de actividad ya definidos, inventario y fabricación;
   los bots aprenden a usarlos.
2. Animaciones de atacar, buscar y fabricar, y estados visibles en los personajes (con la fase 8).
3. **Fase 9:** el Director de eventos y la zona segura.

## Cómo continuar en la próxima sesión

El código está en GitHub y `main` lo tiene todo hasta la 0.6.4. La integración continua ejecuta las pruebas en
cada subida y en cada PR. Al empezar la próxima sesión basta con decir que siga desde el repositorio: lo
siguiente es la fase 8.
