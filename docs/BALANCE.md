# Informe de equilibrio

Generado con `npm run balance` (400 enfrentamientos por pareja y escenario, semilla `equilibrio`).
Cada celda es la media de puntos contra los otros siete arquetipos: ganar vale 1 y que nadie caiga
(huida o sin desenlace) vale 0,5. El objetivo del GDD §16 es que ningún arquetipo quede por encima de
×1,5 ni por debajo de ×0,5 de la media.

| Arquetipo | A campo abierto | Emboscada en el bosque | Segundo día, armas fabricadas | Tercer día de desgaste | Con testigos | **Total** | Respecto a la media |
|---|---:|---:|---:|---:|---:|---:|---:|
| Equilibrado | 42 % | 44 % | 50 % | 59 % | 50 % | **49 %** | ×0.98 |
| Cazador | 60 % | 60 % | 63 % | 56 % | 51 % | **58 %** | ×1.16 |
| Sombra | 49 % | 62 % | 48 % | 41 % | 51 % | **50 %** | ×1.00 |
| Superviviente | 50 % | 51 % | 49 % | 63 % | 38 % | **50 %** | ×1.01 |
| Ingeniero | 42 % | 44 % | 43 % | 63 % | 37 % | **46 %** | ×0.92 |
| Diplomático | 37 % | 36 % | 39 % | 37 % | 62 % | **42 %** | ×0.84 |
| Explorador | 47 % | 55 % | 46 % | 48 % | 55 % | **50 %** | ×1.01 |
| Titán | 73 % | 48 % | 62 % | 33 % | 55 % | **54 %** | ×1.09 |

## Escenarios

- **A campo abierto.** Se ven de lejos en la pradera, de día, con un cuchillo cada uno.
- **Emboscada en el bosque.** Avanzan por bosque denso sin saber del otro. Cada segundo se tira la detección (Instinto contra Sigilo y cobertura). Quien ve primero decide: embosca si le conviene o se aleja sin ser visto. Quien tiene Camuflaje lo usa.
- **Segundo día, armas fabricadas.** Cada uno lleva el arma que mejor le va y puede fabricar (arco con Ingenio 4, hacha y maza con Potencia 5); la calidad depende del Ingenio.
- **Tercer día de desgaste.** Llegan con la salud y la energía que les han dejado el hambre y la sed (según Aguante, Potencia, Instinto y Forrajeo). Con Ingenio 5 llevan escudo y un ungüento; con Trampero o Ingenio 6, una trampa en el camino del rival.
- **Con testigos.** Un tercer participante lo ve todo y, seis de cada diez veces, se une al bando que le cae mejor (atractivo social e intimidación); el rasgo Leal hace más útil al aliado. El favor del público puede traer un botiquín de un mecenas.

## Límites del modelo

- Mide encuentros, no partidas completas: la exploración, los eventos, los mecenas y las alianzas
  largas llegarán con las fases 6–9, y entonces el simulador jugará partidas enteras con bots.
- Todos usan la misma política de combate (la de los bots normales) y huyen por debajo del 25 % de salud.
