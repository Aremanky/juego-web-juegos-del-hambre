# LOS JUEGOS DE LA CENIZA — Documento de Diseño (GDD)

> Versión 1.0 · Fase 1 · Fuente de verdad del diseño. Las cifras exactas viven en
> `packages/shared/src/game/` (atributos, habilidades, rasgos, distritos…) y este documento
> explica el *porqué*. Si una cifra cambia en el código tras pruebas de equilibrio, se anota aquí.

---

## 0. En una frase

Una competición de supervivencia en tiempo real para 2–24 participantes (humanos y bots) en una
arena procedural que cambia sin parar: sobrevive, explora, fabrica, pacta, traiciona y sé el
último en pie mientras la Audiencia lo ve todo.

### Pilares

1. **Historias entre amigos.** Cada sistema debe producir anécdotas: traiciones anunciadas a toda la
   arena, huidas a 3 PV, un bot que te ofrece pacto y te apuñala dos noches después.
2. **Decisiones con consecuencias, no reflejos.** Nada se decide por pulsar rápido. Las decisiones se
   toman en ventanas de segundos, aptas para móvil y para gente que no juega a videojuegos.
3. **Justo y autoritativo.** El servidor decide todo. Los bots ven exactamente lo mismo que vería un
   humano en su lugar.
4. **Cada partida es distinta.** Mapa procedural por semilla, eventos dirigidos, objetivos secretos,
   bots con personalidad y memoria.
5. **Accesible, pero profundo.** Plantillas rápidas y piloto automático para quien no quiere complicarse;
   atributos, sinergias y metajuego social para quien sí.

---

## 1. Identidad original

Inspirada en la estética de las distopías de arena televisada, sin usar nombres, logotipos ni
material de ninguna franquicia.

| Concepto | Nombre propio del juego |
|---|---|
| El juego | **Los Juegos de la Ceniza** (nombre configurable en `APP_NAME`) |
| La capital que organiza | **La Ciudadela** |
| Organizadores / diseñadores de la arena | **Los Arquitectos** |
| Participantes | **Elegidos** (en la interfaz: "participantes") |
| Regiones de origen | **Distritos** I–XII (industrias propias, ver §5.6) |
| Estructura central con botín | **El Obelisco** |
| Público y patrocinio | **La Audiencia** y sus **Mecenas** |
| Parte de bajas al anochecer | **Boletín del Ocaso** (rostros de los caídos en el cielo del mapa) |
| Frontera de la arena | **La Cúpula** |

**Emblema:** obelisco estilizado con una llama en la punta, dentro de un anillo de laurel roto. Original,
sin aves ni elementos reconocibles de otras obras.

**Dirección visual — "La mesa de los Arquitectos":** la partida se ve como si estuvieras en la sala de
control de la Ciudadela.
- Mapa ilustrado-táctico: relieve sombreado procedural, texturas de bioma pintadas por ruido, curvas de
  nivel, árboles y rocas vectoriales, ríos con caudal variable, iconografía propia de puntos de interés,
  rótulos con tipografía imperial.
- Capa holográfica: retícula de sectores (A–L / 1–12), líneas de escaneo, bordes luminosos de zona.
  Botón para alternar **modo cartográfico** (color) y **modo holograma** (monocromo turquesa).
- Paleta: hollín `#17130f` y pizarra `#101719` (fondos cálido y frío), hueso `#efe7da` (texto), ceniza `#b3aa9c`
  (texto secundario), ascua `#f26a2e` (acción, peligro), oro imperial `#c9a24b` (marcos, títulos, victoria),
  turquesa holográfico `#5fe3d0` (estados en vivo, mapa, foco) y sangre `#c2263a` (daño, bajas, errores).
- Colores de distrito: el material de cada industria (óxido, verdín, latón, mar, sodio, raíl, pino, rubia,
  trigo, glaciar, tinta y carbón), todos legibles a 4,5:1 sobre los paneles. Colores de jugador: 16 pigmentos
  apagados de la misma familia. Nada de arcoíris saturado.
- Tipografía (autoalojada, sin CDN): **Cinzel** (capitales de inscripción romana) solo para el nombre del juego,
  títulos de página, nombres de personaje y numerales de distrito; **Archivo** variable con eje de anchura para
  todo lo demás, encabezados de sección incluidos (algo estrecha en encabezados, cifras y HUD).
- Sistema visual «Ceniza y cristal»: hollín cálido de fondo (sin degradados de relleno, solo grano) y paneles de
  cristal frío encima. Las esquinas de visor son de la Ciudadela que vigila y solo enmarcan el **tablero de
  distritos**, el elemento memorable del lobby, que se llena con las caras de los participantes.
- Retratos generados (bots y quien no tiene foto): **camafeos de perfil**, relieve en hueso sobre una concha del
  color del jugador, como el registro de participantes de la Ciudadela. La identidad va en la silueta (nueve
  peinados, nariz, mentón, cuello), que es lo que se lee a 30–40 px. Así un bot nunca se confunde con la foto de
  un amigo.
- Iconografía: sin iconos de serie en botones con texto ni en atributos, habilidades o rasgos; el texto basta.
  La navegación del móvil usa glifos propios (obelisco, camafeo, foto con recorte, puerta) y los iconos de
  biblioteca quedan para controles sin texto (cerrar, enviar, sumar, restar, borrar).
- Atributos: las casillas van en oro y cambian de color al entrar en los tramos caros (7–8 brasa clara, 9–10
  ascua), para que el coste creciente se vea sin leer.
- Vista previa del mapa: curvas de nivel turquesas del modo holograma, generadas por ruido con semilla.

---

## 2. Estructura de una partida

| Fase | Qué pasa | Duración (Estándar) |
|---|---|---|
| **Preparación** (lobby) | Personaje, fotos, atributos, habilidades, plazas de distrito, bots, chat. Todos pueden cambiar su configuración hasta el inicio. | Libre |
| **Presentación** | Desfile de tarjetas de participantes (foto, distrito, epíteto) y sobrevuelo de la arena generada. | ~30 s |
| **Cuenta atrás** | Todos en un anillo alrededor del Obelisco. Movimiento bloqueado. Se reparten los **objetivos secretos**. | 15 s |
| **Estallido** | El Obelisco ofrece el mejor botín: riesgo/recompensa inmediato. | 0–3 min |
| **Desarrollo** | Exploración, recursos, fabricación, alianzas, primeros eventos. Ciclo día/noche. | ~60% |
| **Intensificación** | La zona segura se cierra por etapas, escasean recursos, eventos más duros. | ~30% |
| **Final** | ≤3 supervivientes o última etapa de zona: el Director empuja al encuentro. | Variable |
| **Victoria** | Secuencia cinematográfica del ganador. | ~15 s |
| **Resultados** | Clasificación, estadísticas, cronología, momentos decisivos. | — |

Desempate si los dos últimos caen en el mismo tick: más PV antes del tick → más eliminaciones → más favor.
Opción de sala **"Victoria de distrito"** (desactivada por defecto): si los dos últimos vivos son del mismo
distrito, ganan juntos.

---

## 3. Modelo de tiempo (decisión justificada)

**Elección: mundo en tiempo real continuo + acciones temporizadas + combates por rondas simultáneas.**

- **Mapa en tiempo real:** el jugador da *intenciones* ("ve aquí", "busca", "fabrica una lanza",
  "escóndete"). El servidor calcula la ruta (A* con coste de terreno) y el personaje avanza solo.
  No hay que pulsar sin parar: una orden puede durar minutos.
- **Acciones temporizadas:** buscar (6–10 s), fabricar (8–25 s), colocar trampa (6 s), curarse (6 s)…
  con barra de progreso, cancelables y con riesgo (te pueden sorprender en mitad).
- **Combate por rondas simultáneas:** cuando hay un ataque se abre un *encuentro*. Cada ronda dura una
  ventana (5–10 s según ritmo) en la que cada implicado elige acción a la vez. Si todos eligen antes, la
  ronda se resuelve al momento. Quien no elige usa su **estrategia preconfigurada** (§5.8).

**Por qué:**
- Turnos puros obligan a esperar al más lento y matan la sensación de arena viva.
- Acción en tiempo real pura castiga la latencia y el móvil, y excluye a quien no juega.
- Las ventanas de decisión de segundos toleran 100–300 ms de latencia, el servidor solo valida
  intenciones (autoridad total, anti-trampas) y bots, desconectados y humanos usan la misma API.

**Parámetros técnicos:** simulación a 10 Hz (tick 100 ms); red con deltas agregados a 5 Hz. El movimiento
se envía como **segmentos de ruta** (origen, destino, hora de inicio, velocidad), así el cliente interpola
con suavidad y sin saltos, con correcciones periódicas.

**Ritmos de partida** (configuración de sala):

| Ritmo | Día + noche | Duración objetivo | Ventana de ronda | Sed 100→0 | Hambre 100→0 |
|---|---|---|---|---|---|
| Rápida | 4 + 2 min | 15–25 min | 5 s | 9 min | 18 min |
| Estándar | 8 + 4 min | 30–50 min | 6 s | 18 min | 36 min |
| Larga | 16 + 8 min | 1–2 h | 8 s | 36 min | 72 min |
| **Ilimitada** | 20 + 10 min | Sin límite | 10 s | 45 min | 90 min |

En **Ilimitada** la zona va desactivada por defecto. La partida termina cuando queda uno, y el Director
de eventos va subiendo la presión poco a poco para que no se eternice.

**Pausa por votación:** cualquiera propone pausa; si vota a favor la mayoría (o unanimidad, según
configuración) el tiempo de juego se congela. Se reanuda cuando **todos los humanos conectados** pulsan
"Listo". Tras un reinicio del servidor la partida vuelve en pausa con el mismo mecanismo.

**Desconectados** (configurable): *Protegido* (se esconde y descansa; detección muy difícil),
*Piloto automático* (lo controla la IA de bots con su estrategia; por defecto) o *Eliminar tras N min*.

---

## 4. Supervivencia

| Medidor | Rango | Efecto |
|---|---|---|
| **Salud (PV)** | 0–máx | A 0, eliminado. Regenera despacio descansando y con medicina. |
| **Energía** | 0–máx | La gastan correr, acciones y combate. A 0 → *Exhausto* (−30% daño, sin esquiva). |
| **Hidratación** | 0–100 | <25 *Sediento* (−20% regeneración de energía); a 0 pierde PV. |
| **Nutrición** | 0–100 | <25 *Hambriento* (−20% regeneración); a 0 pierde PV (más lento que la sed). |

**Estados alterados:** Sangrado (−PV/s, vendas), Envenenado (antídoto), Quemado, Aturdido (pierde una
acción), Fractura (−20% velocidad hasta botiquín), Enfermo (agua o comida en mal estado), Frío (noche en
altura/helada sin fuego, refugio ni abrigo), Pánico, Oculto, Vigilando, Exhausto, Descansado.
**Aguante** reduce su probabilidad y duración.

**Día/noche:** de noche la visión baja a ×0,6, el sigilo sube +5 y aparecen eventos nocturnos.
**Fuego:** cocina, hierve agua, da calor y luz. Pero el humo te delata a 25 casillas y anula tu
ocultación de noche. Riesgo frente a recompensa.

---

## 5. Construcción de personaje

### 5.1 Atributos (7)

Todos empiezan en 1 (máx. 10). El **coste es creciente**: niveles 2–6 cuestan 1 punto, 7–8 cuestan 2,
9–10 cuestan 3. Llevar un atributo de 1 a 10 cuesta 15 puntos. Presupuesto por defecto **28** (sala: 24 /
28 / 32), +2 si se elige un defecto. Con 28 puntos se puede ir todo a 5 o especializarse fuerte
sacrificando mucho.

| Atributo | Afecta a | Precio oculto |
|---|---|---|
| **Potencia** | Daño cuerpo a cuerpo, carga máxima, algo de salud, intimidación, armas pesadas | Más hambre (metabolismo) |
| **Reflejos** | Velocidad, esquiva, iniciativa, huida, algo de energía | Personajes frágiles si no hay Aguante |
| **Aguante** | Salud, energía y su regeneración, menos hambre/sed, resistencia a estados, frío y calor | Poco impacto ofensivo |
| **Instinto** | Radio de visión, detectar ocultos/trampas, puntería a distancia, críticos, buscar más rápido y mejor | No protege en cuerpo a cuerpo |
| **Sigilo** | Ocultarse, ruido al moverse, daño de emboscada, robar | Si te encuentran, eres débil |
| **Ingenio** | Velocidad/calidad de fabricación, trampas, curación, investigar puntos de interés, recetas avanzadas | Depende de encontrar materiales |
| **Carisma** | Favor de la Audiencia, precio de mecenas, aceptación de alianzas, negociación, intimidación | Depende de jugar socialmente |

**Fórmulas derivadas** (implementadas en `derived.ts`, mostradas en vivo en el editor):

```
Salud máx         = 70 + 6·Agu + 2·Pot
Energía máx       = 60 + 5·Agu + 1,5·Ref
Regen. energía    = 1,0 + 0,10·Agu        (/s descansando)
Velocidad         = 0,90 + 0,07·Ref       (casillas/s en terreno coste 1)
Carga máx (kg)    = 8 + 1,5·Pot
Daño c/c          = ×(1 + 0,07·(Pot−5))
Esquiva           = 4% + 2,2%·Ref         (activa al esquivar ×2,5)
Iniciativa        = Ref + velocidad de arma
Precisión dist.   = 55% + 4%·Ins          (máx. 95%)
Crítico           = 4% + 1,2%·Ins
Radio de visión   = 6 + 0,6·Ins casillas  (×terreno ×noche ×clima)
Poder de detección= 10 + 3·Ins
Poder de sigilo   = 10 + 3·Sig (+cobertura de terreno, noche, −movimiento)
Ruido al moverse  = 5 − 0,3·Sig casillas  (correr ×2)
Daño de emboscada = ×(1,5 + 0,05·Sig)
Tiempo fabricar   = ×(1,3 − 0,05·Ing)
Calidad fabricada = ±4%·(Ing−5)
Eficacia curación = ×(1 + 0,06·(Ing−5))
Tiempo de búsqueda= 8 s ×(1,2 − 0,04·Ins); rendimiento ×(1 + 0,06·(Ins−5))
Hambre            = ×(1 + 0,04·(Pot−5)) ×(1 − 0,035·(Agu−5))
Sed               = ×(1 − 0,035·(Agu−5))
Resistencia estados = 5%·Agu
Favor             = ×(1 + 0,08·(Car−5))
Atractivo social  = +0,07·(Car−5) en la evaluación de alianzas de los bots
```

**Detección de ocultos:** cada segundo, cada observador con el objetivo en su radio tira
`p = clamp(0,5 + (Detección − Sigilo)/20, 2%, 95%) × proximidad` (1 a distancia 0 → 0,25 en el borde).
Cobertura: abierto −8, pradera −4, roca +3, ruinas +5, bosque +6, pantano +6, bosque denso +10;
noche +5; moverse −6; Vigilar +5 a la detección.

### 5.2 Arquetipos rápidos (28 puntos)

Para quien no quiere complicarse; el editor los muestra comparados con tu reparto actual.

| Arquetipo | Pot | Ref | Agu | Ins | Sig | Ing | Car |
|---|---|---|---|---|---|---|---|
| Equilibrado | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| Cazador | 7 | 6 | 6 | 6 | 3 | 3 | 3 |
| Sombra | 3 | 7 | 4 | 5 | 8 | 3 | 2 |
| Superviviente | 4 | 5 | 8 | 6 | 3 | 5 | 2 |
| Ingeniero | 3 | 4 | 5 | 6 | 4 | 8 | 3 |
| Diplomático | 3 | 5 | 5 | 5 | 3 | 4 | 8 |
| Explorador | 3 | 7 | 6 | 7 | 4 | 3 | 3 |
| Titán | 9 | 4 | 7 | 3 | 2 | 2 | 3 |

Ninguno domina: el Titán gana el cuerpo a cuerpo, pero tiene hambre, es lento y lo ven venir. La Sombra
mata por sorpresa y cae si la pillan. El Diplomático vive de alianzas y mecenas. El Ingeniero empieza
débil y termina con arco, trampas y botiquines. Se comprobará con simulaciones (§16).

### 5.3 Habilidades (eliges 2)

Algunas exigen un mínimo de atributo, lo que crea sinergias con tu reparto.

| Habilidad | Req. | Tipo | Efecto |
|---|---|---|---|
| Carrera | Ref 4 | Activa | +60% velocidad 8 s · 25 energía · recarga 60 s |
| Camuflaje | Sig 4 | Activa | Oculto al instante incluso en abierto, +10 sigilo 25 s · recarga 90 s |
| Rastrear | Ins 4 | Activa | Revela rastros (última posición y rumbo) en 30 casillas 20 s · recarga 75 s |
| Golpe brutal | Pot 5 | Combate | Siguiente golpe c/c +60% daño, 50% aturdir · 1/combate |
| Contraataque | Ref 5 | Combate | Esa ronda, cada esquiva devuelve un golpe al 70% · 1/combate |
| Primeros auxilios | Ing 4 | Activa | Cura 18 PV y corta sangrado sin objetos · 6 s · recarga 120 s |
| Trampero | Ing 5 | Pasiva | Trampas en la mitad de tiempo, −1 material, +1 activa, +20% daño |
| Intimidar | Car 4 o Pot 6 | Combate/Activa | Rival falla tirada → −30% daño 2 rondas; disuade bots 30 s |
| Labia | Car 5 | Pasiva | +25% aceptación de propuestas, pactos +50% duración, desbloquea *Sembrar discordia* |
| Forrajeo | Ins 3 | Pasiva | +40% comida/agua al buscar, detecta comida venenosa, enferma la mitad |
| Escalada | Ref 4 o Pot 4 | Activa | Trepar (bosque): inmune a c/c, +40% visión, +8 sigilo; inmóvil |
| Ojo certero | Ins 5 | Pasiva | +15% precisión, +10% crítico a distancia; ves la salud aproximada |
| Último aliento | Agu 6 | Pasiva | 1/partida: sobrevives a un golpe letal con 1 PV, +30 energía, 3 s invulnerable |
| Señuelo | Ing 3 o Sig 3 | Activa | Ruido y huella falsa a ≤8 casillas 20 s · recarga 90 s |
| Showman | Car 6 | Pasiva | +35% favor, mecenas −20%; pero se revela tu posición 5 s al empezar cada combate |
| Resistencia al dolor | Agu 4 | Pasiva | Estados −40% duración, sin penalización por salud baja, +10% salud máx |

### 5.4 Rasgo de personalidad (opcional, 1)

Cada rasgo tiene ventaja **y** contrapartida.

| Rasgo | Ventaja | Contrapartida |
|---|---|---|
| Leal | Bonos de alianza +50%, reputación inicial 60 | Traicionar: *Remordimiento* (−15% a todo 3 min) y −45 reputación |
| Oportunista | Traiciones +50% favor y +25% daño en el golpe de traición | Reputación inicial 35; los bots desconfían |
| Sangre fría | Inmune a Pánico/Intimidar; +10% precisión con <50% PV | −15% favor (aburres al público) |
| Temerario | +15% daño en el primer ataque de cada combate, +5% velocidad persiguiendo | +10% daño recibido |
| Precavido | +20% detección de trampas y emboscadas | −5% velocidad |
| Solitario | +10% búsqueda, sigilo y daño sin aliados | Alianzas de 2 como máximo y pierde el bono con aliado |
| Metabolismo rápido | +40% regeneración de salud y energía | +25% hambre y sed |
| Insomne | Descansar de noche no reduce tu percepción; +15% visión nocturna | −10% energía máx |
| Paranoico | +15% detección de ocultos; alerta si te apuntan | Descansar recupera −25%; −10% aceptación de alianzas |
| Dramático | +30% favor en combates y eventos | Tus combates se anuncian a toda la arena con tu ubicación |

### 5.5 Defecto (opcional, 1, da +2 puntos)

Miope (−20% visión) · Asmático (−25% regeneración de energía) · Torpe (+20% tiempo de fabricación y trampas)
· Cojera (−8% velocidad) · Frágil (−12% salud) · Antipático (−25% aceptación de alianzas, −15% favor)
· Ruidoso (+40% ruido).

### 5.6 Distritos (12 × 2 plazas: una masculina y una femenina)

Una plaza por género y distrito; el servidor garantiza la unicidad. El distrito da una ventaja pequeña y
de nicho, de unos 5–10%.

| # | Distrito | Ventaja |
|---|---|---|
| I | Forjas | Armas metálicas +10% daño; puede reparar armas |
| II | Laboratorios | Curaciones +25%; identifica venenos y comida peligrosa |
| III | Talleres | Trampas +25% daño; herramientas −20% tiempo de fabricación |
| IV | Puertos | Nada sin penalización; +50% comida al pescar |
| V | Centrales | Inmune a descargas eléctricas; +10% energía máx |
| VI | Raíles | +8% velocidad en caminos y praderas; viajar gasta −15% energía |
| VII | Aserraderos | +12% velocidad en bosque; hachas +15% daño; más madera |
| VIII | Telares | +15% sigilo al esconderse; resiste el frío |
| IX | Graneros | −15% hambre; detecta comida venenosa |
| X | Cumbres | Sin penalización en montaña y roca; +10% visión en altura |
| XI | Archivos | +15% favor; ve la composición de alianzas ajenas |
| XII | Minas | +30% visión nocturna; +8% salud máx |

### 5.7 Objetivos secretos

Al empezar, cada participante recibe uno en privado. Cumplirlo da +40 favor y un pequeño premio.
Ejemplos: sobrevive 10 min sin combatir · forma una alianza con alguien de otro distrito y mantenla 8 min ·
traiciona a un aliado · elimina a alguien con más eliminaciones que tú · explora 4 regiones · fabrica un
arma · recoge un envío de mecenas · cura a un aliado · que una trampa tuya hiera a alguien · sobrevive
dentro de un evento · termina entre los 5 últimos.

### 5.8 Estrategia (piloto automático y rondas sin respuesta)

- **Combate:** Agresiva · Equilibrada · Defensiva · Huidiza.
- **Umbral de huida:** 20% / 35% / 50% PV.
- **Alianzas automáticas:** Aceptar · Evaluar (IA) · Rechazar.

### 5.9 Apariencia y fotos

Foto de retrato (marcador del mapa, lobby, clasificación, combate), foto de victoria opcional y foto de
caído (por defecto, el retrato en blanco y negro). Color identificativo, marco del marcador (laurel,
hexágono, llama, sencillo), epíteto ("la Implacable") y biografía corta para la presentación. Plantillas
guardadas en el servidor, reutilizables entre partidas y dispositivos.

---

## 6. Acciones

| Acción | Duración | Coste | Requisitos | Riesgo / consecuencia |
|---|---|---|---|---|
| Desplazarse | Según ruta | Energía si corres | — | Ruido (te pueden oír); terreno |
| Explorar | Continua | Baja | — | Descubre regiones y PDI (+favor la primera vez) |
| Buscar recursos | 6–10 s | 6 energía | — | Agota la casilla; puede revelar trampas |
| Investigar PDI | 10–20 s | 8 energía | Estar en un PDI | Botín raro o **información** (próximo evento, rastro) |
| Esconderse | 2 s | — | Cobertura o Camuflaje | Moverse rápido o atacar lo rompe |
| Vigilar | Continua | — | — | +detección y alerta de intrusos; no regeneras |
| Descansar | Continua | — | — | Regenera mucho; −8 detección (vulnerable) |
| Curarse | 4–8 s | Objeto | Medicina o Primeros auxilios | Interrumpible |
| Fabricar | 8–25 s | Materiales | Receta, a veces Ingenio | Interrumpible |
| Preparar trampa | 6 s | Materiales | Receta | Máx. 2 activas (Trampero 3) |
| Encender fuego | 5 s | Madera + yesca | — | Humo visible a 25 casillas |
| Perseguir | Continua | Energía | Ver al objetivo | Iniciar combate al alcanzarlo |
| Escapar | Instantánea | Energía | — | Ruta automática lejos de amenazas |
| Atacar / Emboscar | — | — | Alcance; emboscada si no te ven | Abre encuentro; sorpresa si no te detectaron |
| Negociar | Instantánea | — | Ver al otro (o aliado) | Alianza, pacto, comercio, información |
| Compartir | Instantánea | — | ≤3 casillas | Sube reputación |
| Robar | 3 s | 10 energía | Adyacente | Sigilo vs Instinto; si fallas, combate. A un aliado = traición |
| Pedir mecenas | 20 s de entrega | Favor | — | El dron es visible para los cercanos |

---

## 7. Mapa

### 7.1 Generación procedural por semilla

Rejilla de 64², 96² o 128² casillas (1 casilla ≈ 20 m). Altura y humedad con ruido fractal. Lagos en
mínimos locales, ríos por descenso de pendiente desde manantiales de montaña, biomas por altura × humedad.
Llanura central para el Obelisco. Puntos de interés por muestreo Poisson con restricciones, caminos entre
ellos (A* barato en llano), puentes y vados en los cruces con ríos, y nombres generados ("Bosque de los
Susurros", "Cumbres del Eco"). El **servidor genera** el mapa y envía la rejilla compacta; el cliente solo
lo dibuja (sin problemas de determinismo entre navegadores).

### 7.2 Biomas

| Bioma | Coste mov. | Visión propia | Cobertura | Recursos | Peligros |
|---|---|---|---|---|---|
| Camino | 0,8 | 1,0 | −8 | — | Expuesto |
| Pradera | 1,0 | 1,0 | −4 | Hierbas, raíces, piedras, caza menor | Expuesto, calor |
| Playa/orilla | 1,1 | 1,0 | −6 | Agua turbia, conchas, pesca | — |
| Bosque | 1,4 | 0,75 | +6 | Madera, palos, ramas, bayas, resina, plumas | Incendios, bestias |
| Bosque denso | 1,8 | 0,55 | +10 | Lo mismo, más rico | Emboscadas |
| Pantano | 2,2 | 0,8 | +6 | Hierbas raras, resina | Enfermedad |
| Zona rocosa | 1,5 | 1,1 | +3 | Piedra, pedernal, cuevas | Derrumbes |
| Montaña | 2,5 | 1,4 | 0 | Pedernal, nieve (agua) | Frío nocturno, caídas corriendo |
| Cumbre | 3,0 | 1,6 | −2 | Nieve | Frío constante |
| Río / vado | 2,0 | 1,0 | −4 | Agua, pesca | Corriente |
| Lago | Nadar 3,0 | 1,0 | −8 | Agua, pesca | Energía, sin acciones |
| Ruinas | 1,3 | 0,9 | +5 | Chatarra, cuerda, tela, herramientas | Trampas antiguas |
| Poblado | 1,1 | 0,9 | +4 | Raciones, tela, cuerda, medicinas básicas | Disputado |
| Instalación | 1,2 | 0,9 | +3 | Medicinas, gafas, explosivos | Defensas automáticas |
| Obelisco | 1,0 | 1,0 | −6 | El mejor botín | Estallido inicial |
| Cueva/refugio | 1,2 | 0,6 | +8 | — | Descanso +50%, protege del clima |

### 7.3 Evolución de la arena

Zona segura circular que se cierra por etapas (aviso de 30 s, cierre de 60–90 s, daño creciente fuera),
con centro aleatorio dentro de la zona actual. Además: incendios que queman y dejan ceniza sin recursos ni
cobertura, inundaciones, derrumbes que bloquean pasos, sectores sellados, PDI temporales (mercado negro,
cuevas nuevas), cajas de suministro y reabastecimiento del Obelisco. El mapa no deja de cambiar.

### 7.4 Visibilidad

- **Visible (por defecto):** todos ven a todos los que **no están ocultos**. Un oculto desaparece del mapa
  ajeno (queda un "visto por última vez"), salvo para aliados y para quien lo detecte.
- **Niebla de guerra:** cada uno ve solo lo que percibe (visión, ruido, humo) más lo de sus aliados.
- **Regla de oro para bots:** su percepción es **exactamente** la vista filtrada que recibiría un humano en
  su asiento con ese modo (misma función `computeView`), más su memoria. Nunca información privilegiada.

### 7.5 Interacción

Zoom y arrastre (rueda, pellizco), tocar marcador → tarjeta (foto, nombre, humano/bot, estado, salud si es
visible, última posición, alianzas). Tocar casilla → destino con ruta y tiempo estimado previsualizados.
Capas: peligros, recursos conocidos, PDI, eventos. Marcadores circulares con la **foto real** y anillo del
color del jugador, con movimiento interpolado suave.

---

## 8. Recursos, inventario y fabricación

**Inventario con dos límites:** 8 huecos (+4 con mochila) y peso (carga máx. por Potencia). Por encima de la
carga: −30% velocidad y más gasto de energía; no se puede pasar del 150%. **Equipo:** Arma · Protección ·
Utilidad.

**Catálogo base:**
- *Comida:* bayas (alguna venenosa), raíces, pescado/carne cruda (riesgo) o asada, raciones, galletas energéticas.
- *Agua:* turbia (35% de enfermar si no se hierve o purifica), potable, pastillas potabilizadoras, cantimplora (3 usos).
- *Materiales:* palo, rama flexible, piedra, pedernal, cuerda, tela, chatarra, plumas, hierbas, resina, madera.
- *Herramientas:* cuchillo, encendedor, red, brújula (apunta a la zona), prismáticos, gafas nocturnas, mochila, lona.
- *Armas* (daño base): puños 7, cuchillo 16 (rápida, sangrado), honda 14 (dist.), cuchillos arrojadizos 15 (dist., 3),
  lanza 22 (alcance), machete 23, maza 24 (aturde), arco 24 (dist., flechas), arpón 25, espada corta 26 (rara),
  hacha 28 (lenta, Pot 5).
- *Protección:* chaqueta acolchada (−10%, abrigo), chaleco de cuero (−18%), escudo improvisado (bloqueo),
  armadura ligera (−25%, −5% velocidad, rara).
- *Medicina:* vendas, ungüento, antídoto, analgésico, estimulante, botiquín.
- *Especiales:* mapa del sector, bengala, bomba de humo, explosivo improvisado, veneno (unta el arma).

**Recetas:** lanza (palo + piedra + cuerda), arco (rama flexible + cuerda; Ing 4), flechas ×5 (palos + plumas +
piedra), honda (cuerda + tela), hacha de piedra, maza, escudo, vendas ×2 (tela), ungüento (hierbas + agua
potable), antorcha, trampa de lazo, trampa de pinchos (Ing 5), refugio, veneno (bayas oscuras ×2),
explosivo (Ing 8, raro). Cocinar y purificar requieren fuego.

---

## 9. Combate

1. **Inicio:** atacar a alguien a tu alcance (c/c ≤1,5 casillas; distancia según arma y visión). Si el objetivo
   no te había detectado → **ataque sorpresa**: golpe gratis con daño de emboscada y sin reacción esa ronda.
2. **Distancia del encuentro:** *Cerca* o *Lejos*. Quien lleva arma a distancia dispara desde Lejos; el de
   cuerpo a cuerpo debe **Acercarse** (y recibe un disparo si el otro dispara).
3. **Acciones por ronda:** Atacar · Defender (−50% daño, +20% en tu próximo golpe si te atacaron) · Esquivar
   (esquiva ×2,5; si aciertas, el atacante pierde energía) · Habilidad · Objeto · Acercarse/Alejarse · Huir ·
   Tregua (si ambos la eligen, termina el combate).
4. **Resolución simultánea por iniciativa** (Reflejos + velocidad de arma + pequeño azar): si el primero
   mata, el segundo no actúa.
5. **Daño** = base del arma × multiplicador (Potencia o Instinto) × varianza (±15%) × crítico (×1,6) ×
   terreno (altura +10%, agua −15%) × sorpresa − protección. **Azar controlado:** varianza corta, sin tiradas
   todo-o-nada.
6. **Heridas:** filo → sangrado; contundente → aturdir o fractura; fuego → quemado; veneno.
7. **Huida:** `35% + 5%·(Ref propio − Ref máx perseguidor)` ± terreno (bosque +10%, denso +15%, abierto −10%),
   −10% con <30% PV, Carrera +25%. Si sale bien, te alejas 3 casillas con ventaja; si falla, recibes los
   golpes con +25% (espalda expuesta).
8. **Energía:** atacar 8 (pesadas 12), defender 4, esquivar 12, huir 15.
9. **Múltiples:** aliados y espectadores a ≤2 casillas pueden **unirse**. Flanqueo: +10% acierto por atacante
   extra sobre el mismo objetivo. La defensa cubre del todo solo al primero.
10. **Interfaz:** panel con fotos, nombres, salud, equipo, acciones con temporizador, desarrollo ronda a
    ronda y resultado. Los espectadores cercanos lo siguen en vivo.
11. **Registro persistente** de cada combate (participantes, rondas, daño, desenlace) en el historial.

---

## 10. Social: alianzas, pactos y traiciones

- **Alianza** (tamaño máx. configurable, por defecto 3): visión compartida, aliados ocultos visibles entre sí,
  marcadores/pings y chat privado, sin fuego amigo (atacar requiere *Traicionar*), defensa automática
  (≤3 casillas, según estrategia), +15% búsqueda con un aliado cerca, −20% tiempo fabricando juntos,
  flanqueo, comercio a ≤3 casillas.
- **Pactos:** no agresión de 5/10/15 min, intercambio objeto por objeto (atómico en servidor), compartir
  información (PDI descubiertos, recursos conocidos).
- **Romper:** *Abandonar* (pacífico, −5 reputación), *Traicionar* (golpe sorpresa ×1,5 y el traicionado no
  puede defenderse la primera ronda; −30 reputación; anuncio global "¡TRAICIÓN!"; la víctima gana *Sed de
  venganza*, +10% daño contra el traidor) o *Robar* a un aliado.
- **Reputación** pública 0–100 (inicial 50): sube cumpliendo pactos, compartiendo, curando y defendiendo;
  baja traicionando y rompiendo pactos. Los bots la usan y **recuerdan** quién traicionó a quién.
- **Historial de relaciones** por partida (cronología de alianzas, pactos y traiciones).
- **Chat:** global (todo el servidor), de sala (lobby) y de partida (desactivado / solo alianza / todos,
  según configuración). Los eliminados pasan al chat de espectadores.

---

## 11. Audiencia y mecenas

**Favor** (moneda personal), multiplicado por Carisma y rasgos: primera sangre +25, eliminación +20 (+10 si
la víctima tenía más bajas), huida a vida baja +12, traición +30, formar alianza +5, objetivo secreto +40,
nueva región +3, sobrevivir dentro de un evento +8.

**Catálogo de mecenas** (entrega en 20 s; el dron se ve cerca): agua potable 12, ración 15, vendas 18,
antídoto 25, estimulante 25, flechas ×5 20, cuchillo 30, mapa del sector 35, gafas nocturnas 40,
botiquín 45, chaleco de cuero 50, arco 55.

---

## 12. Eventos dinámicos — el Director de los Arquitectos

Motor modular: cada evento es un módulo con **peso, requisitos** (fase, hora, clima, población), **área**,
**aviso**, **efecto por tick**, **fin**, **notificaciones** y **registro**. Un *Director* (como el de
Left 4 Dead) gasta un **presupuesto de intensidad** por fase. Si hay demasiada calma (sin combates en X min),
aumenta los eventos de convergencia; tras un clímax, concede respiro.

**Reglas contra la injusticia:** avisos ≥10 s en todo lo dañino, siempre hay ventana de escape, ningún evento
quita más del 35% de la salud máx. a una persona por minuto, nada apunta a un único jugador salvo los
sociales o anti-acampada (que tienen respuesta), y hay compensación para el que va por detrás.

| Categoría | Eventos |
|---|---|
| Ambientales | Tormenta eléctrica (rayos con aviso de 3 s; Distrito V inmune) · Incendio forestal (se propaga por bosque/pradera, deja ceniza) · Niebla espesa (visión ×0,4) · Lluvia torrencial (sin fuego, apaga incendios, enmascara ruido) · Inundación (orillas → agua 3 min) · Ola de calor (sed ×2,5) · Helada nocturna · Manada de bestias (cazan por detección, temen el fuego) · Derrumbe (bloquea pasos) · Temblor (aturde, abre una cueva con botín) |
| Organización | Envío de suministros (cajas anunciadas: carrera) · Reabastecimiento del Obelisco · Reducción de arena · Campo de minas temporal · Sector sellado · Gran desafío ("el primero en llegar a X gana Y") · Cazador de los Arquitectos (anti-acampada) · Mercado negro (PDI temporal a mitad de precio) |
| Sociales | Recompensa por el líder en bajas (su posición se revela cada 30 s) · Rumor (se revela una alianza u objetivo) · Dilema (salvar a un aliado atrapado o llevarse el suministro) · Tregua forzada con bonificación · Misión secreta individual · El Ojo de los Arquitectos (todas las posiciones 10 s) |
| Inesperados | Eclipse (oscuridad 60 s) · Lluvia de ceniza · Silencio (sin chat ni pings 2 min) · Ronda de clemencia (+20% salud a todos) · Intercambio forzoso · Espejismo (3 cajas, una real; Instinto ≥7 detecta las falsas) · Marea creciente · Noche eterna · Lotería del favor (compensación) |

---

## 13. Bots

**Arquitectura:** *Utility AI* con personalidad, memoria y evaluación de riesgos, más un planificador ligero
tipo GOAP para cadenas de fabricación. Cada bot "piensa" cada 0,8–2,5 s (escalonado) en el servidor y emite
las **mismas intenciones** que un humano por la misma API validada.

- **Percepción:** la vista filtrada de su asiento (§7.4). **Memoria:** entidades vistas (última posición,
  amenaza estimada), recursos conocidos, eventos presenciados (ataques, traiciones y quién), confianza por
  participante (−100..100), mapa de peligros, regiones visitadas.
- **Consideraciones:** sed, hambre, salud, energía, seguridad, equipo, alianzas, objetivo secreto, zona.
- **Acciones evaluadas:** beber, comer, buscar, explorar, recoger, fabricar, descansar, curarse, esconderse,
  huir, ir a zona segura, atacar, emboscar, trampa, proponer/responder alianza, compartir, traicionar,
  robar, pedir mecenas, seguir/defender aliado.
- **Combate:** estima la probabilidad de victoria (simulación rápida; más precisa cuanto más difícil) y
  compara con su umbral de riesgo.
- **Alianzas:** aceptar = f(confianza, reputación del otro, su Carisma, su amenaza, sociabilidad, paranoia,
  tamaño de la alianza, fase). **Traicionar** = f(pocos vivos, aliado débil con buen botín, desesperación) ×
  traición × (1 − lealtad).
- **Diálogo:** frases plantilla por personalidad y situación (propuesta, aceptación, rechazo, burla de
  traición, súplica).

| Personalidad | Agresión | Cautela | Sociab. | Lealtad | Codicia | Curiosidad | Paranoia | Azar |
|---|---|---|---|---|---|---|---|---|
| Agresivo | .90 | .20 | .30 | .50 | .60 | .40 | .30 | .20 |
| Cauteloso | .25 | .90 | .40 | .60 | .40 | .30 | .60 | .10 |
| Estratega | .50 | .60 | .60 | .50 | .50 | .50 | .40 | .05 |
| Pacífico | .10 | .60 | .80 | .80 | .30 | .50 | .20 | .10 |
| Desconfiado | .50 | .70 | .15 | .40 | .50 | .30 | .95 | .15 |
| Manipulador | .45 | .50 | .90 | .20 | .70 | .40 | .40 | .15 |
| Traicionero | .60 | .40 | .70 | .05 | .80 | .30 | .50 | .20 |
| Cooperativo | .35 | .50 | .95 | .90 | .30 | .40 | .20 | .10 |
| Explorador | .35 | .40 | .50 | .60 | .60 | .95 | .30 | .20 |
| Impredecible | .50 | .50 | .50 | .50 | .50 | .50 | .50 | .80 |

**Estilo de juego:** Cazador · Superviviente · Saqueador · Diplomático · Trampero · Equilibrado (modula los
pesos). **Atributos:** se generan equilibrados según personalidad y estilo, con las mismas reglas de puntos.
Cualquiera puede editarlos.

**Dificultad = calidad de decisión, no estadísticas:**

| | Fácil | Normal | Difícil | Experto |
|---|---|---|---|---|
| Ruido en la decisión | σ 0,35 | σ 0,20 | σ 0,10 | σ 0,05 |
| Intervalo de pensamiento | 2,5 s | 1,5 s | 1,0 s | 0,8 s |
| Memoria | 60 s | 180 s | Completa | Completa |
| Evaluación de combate | Muy ruidosa | Ruidosa | Precisa | Precisa + terreno |
| Anticipa zona/eventos | No | Tarde | Sí | Sí, con margen |
| Emboscadas y trampas | No | Básicas | Planificadas | Coordinadas con aliados |
| Gestión de recursos y mecenas | Torpe | Correcta | Buena | Óptima |

Ninguno ve ni sabe más de lo que su personaje percibe.

---

## 14. Resultados, historial y logros

**Pantalla final:** ganador con foto de victoria, clasificación por orden de caída, tiempo de supervivencia,
eliminaciones, daño hecho y recibido, combates, objetos encontrados y fabricados, alianzas, traiciones,
favor, distancia, regiones, objetivo secreto, **momentos destacados** calculados del registro (primera
sangre, mayor traición, alianza más larga, huida más ajustada, más daño) y **cronología** interactiva.

**Historial por usuario:** partidas, victorias, top 3, eliminaciones, traiciones, supervivencia media,
récords y logros (Primera sangre, Superviviente, Traidor, Fiel hasta el final, Sombra —ganar sin
combatir—, Artesano, Favorito del público, Explorador…).

---

## 15. Configuración de sala

| Opción | Valores | Por defecto |
|---|---|---|
| Nombre, máx. participantes | 2–24 | 12 |
| Ritmo | Rápida · Estándar · Larga · Ilimitada | Estándar |
| Zona segura | Desactivada · Lenta · Normal · Rápida | Normal |
| Visibilidad | Visible · Niebla de guerra | Visible |
| Intensidad de eventos | Baja · Media · Alta · Caos | Media |
| Tamaño de mapa | Pequeño · Mediano · Grande | Mediano |
| Puntos de atributo | 24 · 28 · 32 | 28 |
| Equipo inicial | Ninguno · Básico | Ninguno |
| Bots: quién añade / máx. total / máx. por usuario / dificultad por defecto | Todos · Anfitrión / 0–23 / 1–23 / F-N-D-E | Todos / 11 / 6 / Normal |
| Prioridad humana (si la sala está llena, un humano nuevo sustituye al último bot) | Sí/No | Sí |
| Tamaño máx. de alianza | 2–6 | 3 |
| Chat de partida | Desactivado · Alianza · Todos | Alianza |
| Desconectados | Protegido · Piloto · Eliminar tras N min | Piloto |
| Inicio automático cuando todos estén listos | Sí/No | Sí |
| Pausa por votación | Mayoría · Unanimidad | Mayoría |
| Victoria de distrito | Sí/No | No |
| Semilla del mapa | Texto opcional | Aleatoria |

**Autonomía:** cualquiera añade y edita bots, elige plaza, se marca listo y chatea. La partida arranca sola
cuando todos los humanos conectados están listos (no hace falta el anfitrión). El anfitrión configura,
expulsa y puede forzar el inicio. Si se desconecta más de 90 s, el rol pasa a otro humano conectado.

---

## 16. Método de equilibrio

- Partidas *headless* en las pruebas: N simulaciones con bots de dificultad fija usando cada arquetipo.
  Objetivo: ningún arquetipo con una tasa de victoria por encima de 1,5× la media, ni por debajo de 0,5×.
- Métricas: duración media por ritmo, tiempo hasta la primera sangre, % de muertes por evento frente a
  combate (objetivo: eventos <25%), uso de cada habilidad y tasa de traición.
- Los ajustes se reflejan en las tablas de `packages/shared/src/game/` y en este documento.

---

## 17. Retrato con IA usando la GPU del cliente (plan)

Sin servicios externos: inferencia **en el navegador** con ONNX Runtime Web (WebGPU, o WASM en modo ligero)
y modelos **autoalojados en la VM** (`/models`, descargados una vez en la instalación).

1. Segmentación de la persona (modelo pequeño tipo MODNet) → recorte limpio.
2. Estilización pictórica del retrato (red generativa ligera tipo AnimeGAN/estilo cómic, ~10 MB).
   Funciona incluso en móviles por WASM.
3. Composición: fondo y gradación del distrito, marco y color del jugador → **"Retrato de Elegido"**.
4. *Modo avanzado* solo con WebGPU potente: img2img con un difusor rápido de un paso (tipo SD-Turbo,
   ~2 GB, descarga única y cacheada en el navegador).

El resultado se sube a la biblioteca como una foto más, así que persiste y se reutiliza. Se detecta la
capacidad del dispositivo y se elige el modo adecuado, avisando al usuario. Se documentará la licencia de
cada modelo (uso privado no comercial).

---

## 18. Decisiones descartadas

| Alternativa | Por qué no |
|---|---|
| Turnos puros | Esperas y sensación de arena muerta |
| Acción en tiempo real pura | Injusta con latencia y móvil, excluye a no jugadores |
| Docker | Requisito: VM dedicada; systemd es más simple aquí |
| Redis | Una sola instancia; el estado vive en memoria con instantáneas en PostgreSQL. Se puede añadir el adaptador Redis de Socket.IO si un día hay varias instancias |
| Prisma | Binarios de motor y más peso; Drizzle es TS puro y SQL directo |
| Next.js / SSR | No aporta a un juego SPA; Vite + Fastify es más simple |
| Leaflet / mapas tipo app | Aspecto de app de mapas; PixiJS (WebGL) da sensación de juego, efectos y 60 fps en móvil |
| Phaser | Demasiado framework para un mapa + UI React; PixiJS basta |
