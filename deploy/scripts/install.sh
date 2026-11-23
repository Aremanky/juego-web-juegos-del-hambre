#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Instalación en una VM Ubuntu 24.04 dedicada (sin Docker).
#  Ejecútalo desde la carpeta del proyecto:
#
#     sudo ./deploy/scripts/install.sh                         # para usar con cloudflared
#     sudo ./deploy/scripts/install.sh --domain juegos.tudominio.com --with-caddy
#
#  Es seguro repetirlo: no regenera la contraseña de la BD si ya existe el .env.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$SRC_DIR/deploy/scripts/common.sh"
require_root

DOMAIN=""
WITH_CADDY=0
while [[ $# -gt 0 ]]; do
  case $1 in
    --domain) DOMAIN=$2; shift 2 ;;
    --with-caddy) WITH_CADDY=1; shift ;;
    *) fail "Opción desconocida: $1" ;;
  esac
done
[[ $WITH_CADDY -eq 0 || -n $DOMAIN ]] || fail "--with-caddy necesita --domain"

. /etc/os-release
[[ ${VERSION_ID:-} == "24.04" ]] || log "Aviso: probado en Ubuntu 24.04 (tienes ${PRETTY_NAME:-desconocido})."

log "Paquetes del sistema"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl gnupg openssl ufw postgresql postgresql-contrib

if ! command -v node >/dev/null || ! node -v | grep -qE '^v(22|24)\.'; then
  log "Instalando Node.js 22 LTS (repositorio oficial de NodeSource)"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
fi
ok "Node $(node -v)"

log "Usuario de servicio y carpetas"
id ceniza &>/dev/null || useradd --system --home "$BASE_DIR" --shell /usr/sbin/nologin ceniza
install -d -o ceniza -g ceniza -m 750 "$BASE_DIR" "$RELEASES_DIR" "$DATA_DIR" "$DATA_DIR/uploads"
install -d -o root -g ceniza -m 750 "$ETC_DIR"
install -d -o root -g root -m 700 "$BACKUP_DIR_DEFAULT"

log "Base de datos PostgreSQL"
systemctl enable --now postgresql
if [[ ! -f $ENV_FILE ]]; then
  DB_PASS="$(openssl rand -hex 24)"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ceniza') THEN
    CREATE ROLE ceniza LOGIN PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE ceniza WITH LOGIN PASSWORD '${DB_PASS}';
  END IF;
END \$\$;
SQL
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='ceniza'" | grep -q 1 || sudo -u postgres createdb -O ceniza ceniza
  sed -e "s#^DATABASE_URL=.*#DATABASE_URL=postgres://ceniza:${DB_PASS}@127.0.0.1:5432/ceniza#" \
      -e "s#^PUBLIC_URL=.*#PUBLIC_URL=${DOMAIN:+https://$DOMAIN}#" \
      -e "s#^STATIC_DIR=.*#STATIC_DIR=${APP_LINK}/apps/web/dist#" \
      "$SRC_DIR/.env.example" > "$ENV_FILE"
  chown root:ceniza "$ENV_FILE"
  chmod 640 "$ENV_FILE"
  ok "Creado $ENV_FILE con una contraseña aleatoria para la BD"
else
  ok "Se conserva el $ENV_FILE existente"
fi
load_env

log "Compilando la aplicación"
build_release "$SRC_DIR"
REL=$BUILT_RELEASE
ln -sfn "$REL" "$APP_LINK"
install_units "$REL"
systemctl enable --now ceniza.service ceniza-health.timer ceniza-backup.timer
systemctl restart ceniza.service

if wait_healthy; then ok "El juego responde en http://127.0.0.1:${PORT:-3000}"; else
  journalctl -u ceniza -n 50 --no-pager
  fail "El servicio no arranca. Revisa el registro de arriba."
fi

log "Cortafuegos"
ufw allow OpenSSH >/dev/null
if [[ $WITH_CADDY -eq 1 ]]; then
  log "Caddy (HTTPS automático para $DOMAIN)"
  DEBIAN_FRONTEND=noninteractive apt-get install -y caddy
  sed "s/juegos.example.com/$DOMAIN/" "$REL/deploy/caddy/Caddyfile" > /etc/caddy/Caddyfile
  install -d -o caddy -g caddy /var/log/caddy
  systemctl enable caddy
  systemctl reload caddy || systemctl restart caddy
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
fi
ufw --force enable >/dev/null
if [[ $WITH_CADDY -eq 1 ]]; then ok "Cortafuegos activo (SSH, 80 y 443)"; else ok "Cortafuegos activo (solo SSH: el túnel no necesita puertos abiertos)"; fi

prune_releases
cat <<EOF

──────────────────────────────────────────────────────────────
  Instalación completada.

  Configuración:  $ENV_FILE
  Fotos:          $DATA_DIR/uploads
  Copias:         $BACKUP_DIR_DEFAULT (cada día a las 04:37)
  Registro:       journalctl -u ceniza -f

EOF
if [[ $WITH_CADDY -eq 1 ]]; then
  echo "  Abre https://$DOMAIN (el certificado puede tardar un minuto)."
else
  cat <<EOF
  Siguiente paso, publicarlo con tu túnel de Cloudflare:
    cloudflared tunnel create ceniza
    cloudflared tunnel route dns ceniza juegos.tudominio.com
    (usa deploy/cloudflared/config.yml.example → servicio http://127.0.0.1:3000)
  Después pon PUBLIC_URL=https://juegos.tudominio.com en $ENV_FILE
  y reinicia: sudo systemctl restart ceniza
EOF
fi
echo "──────────────────────────────────────────────────────────────"
