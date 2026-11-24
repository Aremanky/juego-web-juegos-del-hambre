# Prueba de carga

Generado con `npm run load`: 24 humanos en la misma partida (mapa grande, 128 × 128, con
niebla de guerra), cada uno dando una orden de movimiento cada 1–2 s durante 31.8 s. Clientes y
servidor comparten proceso en la misma máquina, así que las cifras son pesimistas.

| Medida | Resultado | Presupuesto |
|---|---:|---:|
| Órdenes enviadas / rechazadas | 488 / 0 | < 5 % rechazadas |
| Respuesta a una orden (p50 / p95 / máx.) | 3 / 4 / 9 ms | p95 < 250 ms |
| Tick del servidor (p50 / p95 / p99 / máx.) | 1.14 / 2.49 / 3.29 / 5.45 ms | p95 < 15 ms (hay 100 ms por tick) |
| Retraso del bucle de eventos (p99 / máx.) | 12.2 / 21.2 ms | p99 < 100 ms |
| Tráfico por jugador (media / máx.) | 5.61 / 9.37 KB/s | < 20 KB/s |
| Fotogramas por jugador | 6.71 /s | — |
| Tráfico total de partida enviado por el servidor | 123.3 KB/s | — |
| Memoria del proceso durante la prueba | +19 MB | — |

Al terminar se para a todos y se comprueba que la réplica de cada cliente (instantánea + fotogramas)
coincide exactamente con la vista que el servidor calcula para él.
