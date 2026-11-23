#!/usr/bin/env bash
# Funciones y rutas comunes de los scripts de despliegue.
set -euo pipefail
shopt -s inherit_errexit  # que set -e también aplique dentro de $(...)

BASE_DIR=/opt/ceniza
APP_LINK=$BASE_DIR/app            # enlace simbólico a la versión activa
RELEASES_DIR=$BASE_DIR/releases
DATA_DIR=/var/lib/ceniza
ETC_DIR=/etc/ceniza
ENV_FILE=$ETC_DIR/ceniza.env
BACKUP_DIR_DEFAULT=/var/backups/ceniza
KEEP_RELEASES=3

log() { printf '\033[33m▶\033[0m %s\n' "$*"; }
ok() { printf '\033[32m✔\033[0m %s\n' "$*"; }
fail() { printf '\033[31m✘\033[0m %s\n' "$*" >&2; exit 1; }

require_root() { [[ $EUID -eq 0 ]] || fail "Ejecuta este script con sudo."; }

load_env() {
  [[ -f $ENV_FILE ]] || fail "No existe $ENV_FILE. ¿Has ejecutado install.sh?"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

wait_healthy() {
  local port=${PORT:-3000}
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 3 "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}

# Copia el código a una versión nueva, instala dependencias, compila y aplica migraciones.
# Deja la ruta de la versión en la variable global BUILT_RELEASE.
BUILT_RELEASE=""
build_release() {
  local src=$1
  local rel
  rel="$RELEASES_DIR/$(date +%Y%m%d-%H%M%S)"
  install -d -o ceniza -g ceniza -m 750 "$RELEASES_DIR" "$rel"
  tar -C "$src" \
    --exclude=./node_modules --exclude='./*/*/node_modules' --exclude=./.git --exclude=./.env \
    --exclude=./var --exclude=./e2e/.artifacts --exclude='./apps/*/dist' \
    -cf - . | tar -C "$rel" -xf -
  [[ -f $rel/package-lock.json ]] || fail "La copia del código a $rel ha fallado."
  chown -R ceniza:ceniza "$rel"
  log "Instalando dependencias y compilando en $rel (tarda un par de minutos)…"
  sudo -u ceniza -H bash -c "cd '$rel' && npm ci --no-audit --no-fund --loglevel=error && npm run build"
  [[ -f $rel/apps/server/dist/index.js && -f $rel/apps/web/dist/index.html ]] || fail "La compilación no ha generado los archivos esperados."
  log "Aplicando migraciones de base de datos…"
  sudo -u ceniza -H bash -c "set -a; source '$ENV_FILE'; set +a; cd '$rel' && node apps/server/dist/scripts/migrate.js"
  chmod +x "$rel"/deploy/scripts/*.sh
  BUILT_RELEASE=$rel
}

install_units() {
  local rel=$1
  install -m 644 "$rel"/deploy/systemd/ceniza*.service "$rel"/deploy/systemd/ceniza*.timer /etc/systemd/system/
  systemctl daemon-reload
}

prune_releases() {
  local current
  current=$(readlink -f "$APP_LINK" || true)
  find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | sort | head -n -"$KEEP_RELEASES" | while read -r old; do
    [[ $old == "$current" ]] || rm -rf "$old"
  done
}
