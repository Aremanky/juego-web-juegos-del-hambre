#!/usr/bin/env bash
# Restaura una copia de seguridad.
#   sudo ./deploy/scripts/restore.sh /var/backups/ceniza/db-AAAAMMDD-HHMMSS.dump [/var/backups/ceniza/uploads-AAAAMMDD-HHMMSS.tar.gz]
set -euo pipefail
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$SRC_DIR/deploy/scripts/common.sh"
require_root
load_env

DUMP=${1:-}
ARCHIVE=${2:-}
[[ -f $DUMP ]] || fail "Indica el archivo .dump a restaurar."

log "Parando el juego"
systemctl stop ceniza.service

log "Restaurando la base de datos desde $DUMP"
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$DUMP"

if [[ -n $ARCHIVE ]]; then
  [[ -f $ARCHIVE ]] || fail "No existe $ARCHIVE"
  UPLOADS=${UPLOAD_DIR:-/var/lib/ceniza/uploads}
  if [[ -d $UPLOADS ]]; then mv "$UPLOADS" "$UPLOADS.antes-de-restaurar-$(date +%s)"; fi
  tar -C "$(dirname "$UPLOADS")" -xzf "$ARCHIVE"
  chown -R ceniza:ceniza "$UPLOADS"
  ok "Fotos restauradas (la carpeta anterior se ha conservado con otro nombre)"
fi

systemctl start ceniza.service
wait_healthy && ok "Restauración completada y el juego responde." || fail "El juego no responde tras restaurar: journalctl -u ceniza -n 50"
