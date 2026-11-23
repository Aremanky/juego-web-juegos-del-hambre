#!/usr/bin/env bash
# Copia de seguridad: volcado de PostgreSQL (formato custom) + fotos. Rotación automática.
# Variables opcionales (en /etc/ceniza/backup.env):
#   BACKUP_DIR=/var/backups/ceniza   BACKUP_KEEP_DAYS=14   BACKUP_COPY_DIR=/mnt/nas/ceniza
set -euo pipefail
if [[ -z ${DATABASE_URL:-} && -f /etc/ceniza/ceniza.env ]]; then
  set -a
  source /etc/ceniza/ceniza.env
  set +a
fi
: "${DATABASE_URL:?Falta DATABASE_URL}"
BACKUP_DIR=${BACKUP_DIR:-/var/backups/ceniza}
KEEP=${BACKUP_KEEP_DAYS:-14}
UPLOADS=${UPLOAD_DIR:-/var/lib/ceniza/uploads}
STAMP=$(date +%Y%m%d-%H%M%S)

umask 077
mkdir -p "$BACKUP_DIR"
pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file="$BACKUP_DIR/db-$STAMP.dump"
if [[ -d $UPLOADS ]]; then
  tar -C "$(dirname "$UPLOADS")" -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" "$(basename "$UPLOADS")"
fi

find "$BACKUP_DIR" -maxdepth 1 \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +"$KEEP" -delete

if [[ -n ${BACKUP_COPY_DIR:-} ]]; then
  if [[ -d $BACKUP_COPY_DIR ]]; then
    cp "$BACKUP_DIR/db-$STAMP.dump" "$BACKUP_COPY_DIR/"
    [[ -f $BACKUP_DIR/uploads-$STAMP.tar.gz ]] && cp "$BACKUP_DIR/uploads-$STAMP.tar.gz" "$BACKUP_COPY_DIR/"
  else
    echo "Aviso: BACKUP_COPY_DIR=$BACKUP_COPY_DIR no existe; copia externa omitida." >&2
  fi
fi
echo "Copia completada: $BACKUP_DIR/db-$STAMP.dump"
