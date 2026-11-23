# Prueba de carga

Generado con `npm run load`: 24 humanos en la misma partida (mapa grande, 128 × 128, con
niebla de guerra), cada uno dando una orden de movimiento cada 1–2 s durante 31.8 s. Clientes y
servidor comparten proceso en la misma máquina, así que las cifras son pesimistas.

| Medida | Resultado | Presupuesto |
|---|---:|---:|
| Órdenes enviadas / rechazadas | 489 / 0 | < 5 % rechazadas |
| Respuesta a una orden (p50 / p95 / máx.) | 2 / 4 / 10 ms | p95 < 250 ms |
| Tick del servidor (p50 / p95 / p99 / máx.) | 0.19 / 1.91 / 3.72 / 11.87 ms | p95 < 15 ms (hay 100 ms por tick) |
| Retraso del bucle de eventos (p99 / máx.) | 11.5 / 19.3 ms | p99 < 100 ms |
| Tráfico por jugador (media / máx.) | 6.83 / 9.74 KB/s | < 20 KB/s |
| Fotogramas por jugador | 8.53 /s | — |
| Tráfico total de partida enviado por el servidor | 153.6 KB/s | — |
| Memoria del proceso durante la prueba | +2.8 MB | — |

Al terminar se para a todos y se comprueba que la réplica de cada cliente (instantánea + fotogramas)
coincide exactamente con la vista que el servidor calcula para él.
