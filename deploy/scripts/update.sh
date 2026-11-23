#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Actualiza el juego con el código de la carpeta actual (tras un git pull o al
#  descomprimir una versión nueva). Hace copia de seguridad, compila en una
#  versión nueva y, si no arranca, vuelve automáticamente a la anterior.
#
#     sudo ./deploy/scripts/update.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$SRC_DIR/deploy/scripts/common.sh"
require_root
load_env

PREV=$(readlink -f "$APP_LINK" || true)

log "Copia de seguridad previa a la actualización"
"$SRC_DIR/deploy/scripts/backup.sh"

build_release "$SRC_DIR"
REL=$BUILT_RELEASE
ln -sfn "$REL" "$APP_LINK"
install_units "$REL"
systemctl restart ceniza.service

if wait_healthy; then
  ok "Actualizado a $(basename "$REL")"
  prune_releases
  exit 0
fi

journalctl -u ceniza -n 40 --no-pager
if [[ -n $PREV && -d $PREV ]]; then
  log "La versión nueva no arranca: volviendo a $(basename "$PREV")"
  ln -sfn "$PREV" "$APP_LINK"
  systemctl restart ceniza.service
  wait_healthy && ok "Restaurada la versión anterior." || true
  echo "Si la nueva versión aplicó migraciones incompatibles, restaura la BD con:"
  echo "  sudo $PREV/deploy/scripts/restore.sh \$(ls -t $BACKUP_DIR_DEFAULT/db-*.dump | head -1)"
fi
fail "La actualización ha fallado."
