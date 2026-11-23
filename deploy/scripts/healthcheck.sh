#!/usr/bin/env bash
# Lo lanza ceniza-health.timer cada minuto. Tras 3 fallos seguidos reinicia el servicio.
# (systemd ya reinicia si el proceso muere; esto cubre bloqueos sin caída.)
STATE=/run/ceniza-health.fails
PORT=${PORT:-3000}
if curl -fsS --max-time 5 "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
  echo 0 >"$STATE"
  exit 0
fi
n=$(($(cat "$STATE" 2>/dev/null || echo 0) + 1))
echo "$n" >"$STATE"
logger -t ceniza-health "El juego no responde (fallo $n de 3)"
if ((n >= 3)); then
  logger -t ceniza-health "Reiniciando ceniza.service"
  systemctl restart ceniza.service
  echo 0 >"$STATE"
fi
