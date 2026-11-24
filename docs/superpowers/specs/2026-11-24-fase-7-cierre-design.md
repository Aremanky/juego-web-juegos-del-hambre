# Cierre de la fase 7 — diseño

**Fecha:** 24/11/2026 · **Versión objetivo:** 0.6.3 · **Rama:** encima de `fase-6-cierre`

## Intención

Andrés quiere cerrar la fase 7 (mapa ilustrado, personajes animados, movimiento y exploración) con todo lo
que no depende de otras fases. Lo que depende de la 8 o la 9 pasa a esas fases en el estado del proyecto.

Lo que falta sale del GDD, no solo de la lista de pendientes del estado:
- §5.9: cinco direcciones dibujadas (S, SE, E, NE, N; las otras tres en espejo) y, de las animaciones
  mínimas, trepar y morir. Hoy hay tres vistas (frente, espalda y lado) y el caído aparece de golpe.
- §7.4: quien sale de tu vista deja un «visto por última vez». Hoy desaparece sin más.
- §7.5: tocar a un personaje abre su tarjeta, y tocar una casilla enseña la ruta y el tiempo de llegada
  antes de ir. Hoy un toque manda ir directamente y no hay tarjeta.
- Pendiente del estado: PixiJS «si hiciera falta en móviles». Se decide midiendo.

## Objetivos

1. Personajes en cinco direcciones, con trepar y caer animados.
2. Tarjeta del participante al tocarlo en el mapa o en la lista.
3. Ruta y tiempo de llegada antes de moverse, con el mismo cálculo que el servidor.
4. «Visto por última vez» con niebla.
5. Decisión medida sobre PixiJS.
6. Estado, GDD y arquitectura al día; las partes de la 8 y la 9 movidas a esas fases.

## No objetivos (pasan a otras fases)

- Fase 8: animaciones de atacar (cuerpo a cuerpo y a distancia), defender, esquivar, recibir golpe, caer
  aturdido, buscar o recoger, fabricar, comer y beber; estados visibles (herido, envenenado, agotado,
  escondido); gestos sociales (saludar, señalar, proponer pacto); salud y alianzas en la tarjeta; capas de
  peligros y de recursos conocidos.
- Fase 9: cambios del mapa por eventos y capa de eventos.
- Sprites pintados de SpriteCook: necesitan las hojas en PNG, que desde aquí no se pueden descargar. Siguen
  siendo opcionales; el dibujo vectorial se queda.

## Antiobjetivos (si pasa esto, ha fallado aunque funcione)

- La tarjeta o la marca de «visto por última vez» enseñan algo que el jugador no ha visto: posición actual
  de quien no ve, build, salud o datos de otra partida.
- El tiempo de la vista previa no coincide con el de la ruta que luego hace el servidor.
- En escritorio, moverse cuesta más clics que hoy.
- Las vistas nuevas no parecen el mismo personaje (proporciones, colores o grosor de línea distintos) o
  tienen pinta de hechas con IA.

## Enfoques y decisiones

| Decisión | Opciones | Elegida y por qué |
|---|---|---|
| Vistas de 3/4 | (a) dos vistas nuevas (`frente34`, `espalda34`) junto a las tres de hoy; (b) un ángulo continuo para todo el cuerpo | **(a)**: la figura está ajustada a mano por vista; un ángulo continuo obliga a rehacer cada pieza y arriesga romper las que ya están bien. |
| Datos para la vista previa | (a) el servidor manda la velocidad y los costes por terreno del propio personaje; (b) el cliente los recalcula con su build | **(a)**: exacto por construcción, pocos bytes, y solo al propio jugador, como ya pasa con la visión. |
| Cálculo de la ruta | (a) una función pura del motor que usan el servidor y el cliente; (b) duplicar la lógica en el cliente | **(a)**: `planRoute`, y `moveIntent` pasa a usarla. Lo que se ve es lo que hará el servidor. |
| Escritorio | (a) al pasar el ratón se ve la ruta y el tiempo, y un clic va; (b) clic para ver y otro para ir | **(a)**: la vista previa llega antes de actuar y moverse sigue siendo un clic. |
| Táctil | (a) primer toque enseña la ruta y el tiempo; segundo toque en la misma casilla o el botón «Ir» van; (b) un toque va y después enseña el tiempo | **(a)**: es lo que pide el GDD. |
| «Visto por última vez» | (a) lo recuerda el cliente; (b) lo manda el servidor | **(a)**: el cliente solo recuerda lo que ya vio, sin cambiar el protocolo ni arriesgar fugas. Se pierde al recargar la página, que es aceptable. |
| Tarjeta | (a) junto al personaje en escritorio y hoja inferior en móvil; (b) siempre en el panel lateral | **(a)**: se lee sin apartar la vista del mapa; en móvil no tapa el centro. |
| PixiJS | (a) medir y decidir; (b) pasar ya | **(a)**, como la GPU en la fase 6: solo si hace falta. |

## Diseño

### 1. Cinco direcciones, trepar y caer

- `Facing` pasa a ocho rumbos (`S`, `SE`, `E`, `NE`, `N`, `NO`, `O`, `SO`). Vistas dibujadas: frente (S),
  `frente34` (SE), lado (E), `espalda34` (NE) y espalda (N). SO, O y NO, en espejo.
- El rumbo sale del movimiento en sectores de 45°. Quieto, conserva el último.
- 3/4 de frente: torso algo más estrecho con la sombra hacia el lado lejano, rasgos de la cara desplazados
  hacia donde mira y la oreja lejana visible, el brazo lejano medio oculto detrás del torso, piernas más
  juntas que de frente y zancada a medio camino entre la de frente y la de lado. Mochila, carcaj, capa y
  bufanda asoman por el lado lejano. 3/4 de espalda, el equivalente desde detrás.
- Trepar: en montaña y cumbre, si se mueve y no nada. Cuerpo inclinado hacia delante, brazos que se
  alternan hacia arriba y zancada corta.
- Caer: cuando el cliente ve pasar a alguien de vivo a caído, una animación corta (unos 700 ms) desde de pie
  hasta la postura de caído de hoy. Los que ya estaban caídos al entrar no se animan. Con «reducir
  movimiento», directamente caído.
- Misma luz (del noroeste), mismo contorno y misma paleta que hoy. Legible a 32–64 px.

### 2. Tarjeta del participante

- Se abre al tocar a un personaje en el mapa (en el más cercano al dedo, con margen para el táctil) o su fila
  en «Participantes». Se cierra con Esc, con el botón de cerrar o tocando fuera.
- Contenido:
  - camafeo o foto, nombre y epíteto, distrito y humano o bot (en un bot, su personalidad y dificultad,
    que ya son públicas en el lobby);
  - estado: el mismo texto que la lista;
  - si lo ves: distancia y tiempo hasta él con tu ruta;
  - si no lo ves: «Visto por última vez hace…» o «Aún no lo has visto».
- Botón «Ir hacia aquí»: va directamente a su casilla si lo ves, o a la marca si no; la tarjeta ya enseña
  el tiempo.
- Es un diálogo accesible: título con su nombre, el foco va al botón de cerrar al abrir y vuelve a donde
  estaba al cerrar.
- Sin salud ni alianzas: llegan con la fase 8.

### 3. Ruta y tiempo antes de ir

- Motor: `planRoute(map, from: { x, y, route }, to, t, speed, costs?)` devuelve
  `{ ok: true, route: Route | null, arrival }` (como hoy: el tramo en curso hasta la siguiente casilla más
  el nuevo; `null` si el destino es esa misma casilla y se para allí) o `{ ok: false, error }` con los
  mensajes de hoy («No hay camino hasta ahí», «Demasiado lejos…»). `moveIntent` pasa a usarla.
- La vista propia (`ActorView`) gana `move: { speed, costs } | null`, solo para el propio personaje.
- Ratón o táctil se decide por el tipo de puntero de cada evento, no por el tamaño de pantalla (hay
  portátiles táctiles).
- Ratón: al pasar por una casilla se recalcula como mucho una vez por casilla. Se dibuja la
  ruta prevista (discontinua, más tenue que la real) y, junto al destino, el tiempo con halo, como los
  rótulos del mapa. Un clic va.
- Táctil: el primer toque (si no hay una tarjeta abierta, que se cierra con ese toque) enseña lo mismo y un botón «Ir · ≈ 1 min 20 s» en la parte de abajo (objetivo de
  44 px). Un segundo toque en la misma casilla o el botón van. Otro toque mueve la vista previa. Arrastrar o
  pellizcar no la crea. Desaparece al ir o a los 8 s sin tocar nada.
- Formato del tiempo en español: «≈ 25 s», «≈ 1 min 20 s».

### 4. «Visto por última vez»

- La tienda recuerda la última posición y la hora de cada vivo que pasa de visto a no visto: la posición
  interpolada en ese momento. Se borra al volver a verlo, al caer (eso es público) o al cambiar de partida.
- En el mapa: un anillo discontinuo de su color donde se le vio, su nombre en un tono apagado y «hace 1 min»
  debajo. Se atenúa con el tiempo sin desaparecer.

### 5. PixiJS

- Banco con el mapa real (bloques, objetos, 24 personajes moviéndose, rótulos, bocadillos y noche) en
  Chrome sin GPU, a 390×844 con densidad 3 y a 1280×720, sin freno de CPU y con ×4 y ×6. Se mide el tiempo
  por fotograma durante 10 s.
- Criterio: con ×4 a 30 fps o más, se queda el canvas 2D. Si no llega, primero se abarata el canvas
  (densidad máxima en móviles, sombras) y se vuelve a medir; PixiJS solo si aun así no llega.
- Se documenta con las medidas y cuándo retomarlo (si en un móvil real baja de 30 fps).

### 6. Documentos y versión

GDD (§5.9, §7.4, §7.5 y la decisión de PixiJS), arquitectura y estado: la fase 7 al 100 % y lo de las
fases 8 y 9 en sus listas. Versión 0.6.3.

## Pruebas

- Motor: `planRoute` da la misma ruta que `moveIntent` (también con un tramo en curso) y los mismos errores;
  `move` solo en la vista propia.
- Cliente, funciones puras con vitest:
  - rumbo en ocho sectores;
  - qué personaje se toca (el más cercano, con margen; nada fuera);
  - «visto por última vez»: se guarda al dejar de verlo y se borra al verlo, al caer o al cambiar de partida;
  - formato del tiempo;
  - vista previa táctil (primer toque enseña, segundo va, otro toque mueve, arrastrar no crea, caduca).
- Visual, como mucho dos rondas de capturas:
  - ocho rumbos en reposo, andando, corriendo y trepando, a 64 y 32 px;
  - secuencia de caída;
  - tarjeta y botón «Ir» en escritorio y móvil, con el CSS real en una página estática;
  - vista previa y marca, de día, de noche y en holograma.
- Servidor: la instantánea lleva `move` solo para el propio jugador y `match:move` sigue funcionando. Se
  escribe; se ejecuta fuera de aquí.
- Medida de rendimiento (§5).

## Lo que decide quien lo construye

Los trazos exactos de las vistas de 3/4 y de trepar y caer, las distancias de toque, los textos finales y
las medidas que salgan del banco.
