# Despliegue en Proxmox (VM Ubuntu dedicada, sin Docker)

## 1. Requisitos

| Recurso | Mínimo | Recomendado | Notas |
|---|---|---|---|
| vCPU | 2 | 2–4 (tipo `host`) | El motor y los bots usan un núcleo por partida activa |
| RAM | 2 GB | 4 GB | Node ~300–600 MB + PostgreSQL |
| Disco | 16 GB | 32 GB | Sistema ~6 GB, código y versiones ~2 GB, fotos ~1 MB por foto, copias de 14 días |
| Red | Salida a Internet | — | Para instalar paquetes y, si usas túnel, conectar con Cloudflare |

**Puertos:**

| Puerto | Escucha en | Abrir al exterior |
|---|---|---|
| 3000 (Node) | 127.0.0.1 | No |
| 5432 (PostgreSQL) | 127.0.0.1 | No |
| 22 (SSH) | VM | Solo en tu LAN o con VPN |
| 80 y 443 | VM (solo con Caddy) | Sí, en el router hacia la VM, **solo si no usas túnel** |

Con un túnel de Cloudflare no hace falta abrir ningún puerto en el router.

## 2. Crear la VM en Proxmox

1. Sube la ISO de **Ubuntu Server 24.04 LTS** (o usa una plantilla cloud-init).
2. *Create VM*: 2–4 vCPU tipo `host`, 4 GB RAM, disco VirtIO SCSI de 32 GB con *Discard*, red `vmbr0` (VirtIO).
3. Activa *QEMU Guest Agent* y *Start at boot*.
4. Instala Ubuntu con OpenSSH; después: `sudo apt install qemu-guest-agent && sudo systemctl enable --now qemu-guest-agent`.
5. Recomendado: una IP fija (reserva DHCP en el router o netplan) y un trabajo de copia de la VM en *Datacenter → Backup* (vzdump semanal), además de las copias diarias propias del juego.

## 3. Instalar el juego

Copia el proyecto a la VM (zip descomprimido o `git clone` de tu repositorio) y desde su carpeta:

```bash
# Si vas a publicar con cloudflared (recomendado para tu homelab):
sudo ./deploy/scripts/install.sh

# Si vas a abrir 80/443 y quieres HTTPS automático con Caddy:
sudo ./deploy/scripts/install.sh --domain juegos.tudominio.com --with-caddy
```

El script (se puede repetir sin miedo):

- instala Node 22, PostgreSQL 16 y ufw;
- crea el usuario de servicio `ceniza` y las carpetas `/opt/ceniza`, `/var/lib/ceniza/uploads` y `/var/backups/ceniza`;
- crea la BD con una contraseña aleatoria y escribe `/etc/ceniza/ceniza.env` (permisos 640);
- compila una versión en `/opt/ceniza/releases/<fecha>` y la activa con el enlace `/opt/ceniza/app`;
- aplica las migraciones e instala `ceniza.service`, `ceniza-health.timer` y `ceniza-backup.timer`;
- activa el cortafuegos (SSH, más 80/443 si usas Caddy) y comprueba que el juego responde.

Revisa `/etc/ceniza/ceniza.env` (ver `.env.example`). Lo más importante:

- `PUBLIC_URL=https://juegos.tudominio.com`
- `REGISTRATION_CODE=algo-que-solo-sepan-tus-amigos` (muy recomendable si el juego es público en Internet)

Tras cambiarlo: `sudo systemctl restart ceniza`.

## 4. Publicarlo en Internet

### Opción A: túnel de Cloudflare (sin abrir puertos)

```bash
# En la VM (o en tu máquina de cloudflared, apuntando a la IP de la VM)
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install cloudflared
cloudflared tunnel login
cloudflared tunnel create ceniza
cloudflared tunnel route dns ceniza juegos.tudominio.com
sudo cp deploy/cloudflared/config.yml.example /etc/cloudflared/config.yml   # edita TUNNEL_ID y dominio
sudo cloudflared service install
```

Si tu cloudflared ya corre en otra máquina o contenedor, añade una regla de *ingress* hacia
`http://IP_DE_LA_VM:3000` y, en la VM, cambia `HOST=0.0.0.0` en el `.env`; limita el acceso a ese puerto con
`sudo ufw allow from IP_DE_CLOUDFLARED to any port 3000`. Socket.IO funciona a través del túnel sin más configuración.

### Opción B: Caddy con HTTPS automático

1. Registro A/AAAA de `juegos.tudominio.com` apuntando a tu IP pública.
2. Redirige 80 y 443 del router a la VM.
3. `sudo ./deploy/scripts/install.sh --domain juegos.tudominio.com --with-caddy`. Caddy obtiene y renueva el certificado solo.

### Opción C: Nginx

Usa `deploy/nginx/ceniza.conf` y `sudo certbot --nginx -d juegos.tudominio.com`.

## 5. Actualizar

```bash
cd /ruta/del/proyecto && git pull     # o descomprime la versión nueva
sudo ./deploy/scripts/update.sh
```

Hace una copia de seguridad, compila una versión nueva, migra, reinicia y **vuelve sola a la versión anterior**
si la nueva no responde. Se conservan las 3 últimas versiones.

## 6. Copias de seguridad

- Automáticas cada día a las 04:37: `/var/backups/ceniza/db-*.dump` (PostgreSQL) y `uploads-*.tar.gz` (fotos), 14 días.
- Manual: `sudo /opt/ceniza/app/deploy/scripts/backup.sh`
- Copia externa: crea `/etc/ceniza/backup.env` con `BACKUP_COPY_DIR=/mnt/nas/ceniza` (una carpeta montada de tu NAS o disco).
- Restaurar:
  ```bash
  sudo /opt/ceniza/app/deploy/scripts/restore.sh /var/backups/ceniza/db-AAAAMMDD-HHMMSS.dump /var/backups/ceniza/uploads-AAAAMMDD-HHMMSS.tar.gz
  ```

## 7. Registros y recuperación ante fallos

| Qué | Cómo |
|---|---|
| Registro en vivo | `journalctl -u ceniza -f` |
| Estado | `systemctl status ceniza` · `curl -s localhost:3000/api/health` |
| Caída del proceso | systemd lo reinicia en 3 s (`Restart=always`) |
| Bloqueo sin caída | `ceniza-health.timer` comprueba cada minuto y reinicia tras 3 fallos |
| Actualización rota | `update.sh` vuelve a la versión anterior automáticamente |
| Datos | Restaurar desde la copia diaria o desde el vzdump de Proxmox |
| Reinicio de la VM | Todo arranca solo; las salas se recuperan desde la BD al entrar |

## 8. Lista de seguridad

- [ ] `REGISTRATION_CODE` definido si el juego es accesible desde Internet.
- [ ] SSH solo con clave (`PasswordAuthentication no`) y no expuesto a Internet.
- [ ] `sudo apt install unattended-upgrades` para parches automáticos.
- [ ] Copia externa configurada (`BACKUP_COPY_DIR`) y vzdump en Proxmox.

## 9. Qué se ha probado y qué falta

**Probado en un entorno Ubuntu 24.04 idéntico al de la VM (sin systemd):**
- creación del usuario de servicio y del `.env` con contraseña aleatoria;
- compilación de una versión con `npm ci` desde el lockfile;
- migraciones ejecutadas como el usuario `ceniza`;
- arranque con el mismo usuario, archivo de entorno y carpeta que usa la unidad systemd, y health check correcto;
- copia de seguridad (BD y fotos) y restauración verificada;
- modo producción: frontend servido por Node, rutas de la SPA, CSP y caché inmutable.

**Pendiente de validar en tu VM real:** las unidades systemd y sus temporizadores, ufw, Caddy o cloudflared
con tu dominio. Se hará en la fase 12, o antes si quieres probar el lobby con tus amigos.
