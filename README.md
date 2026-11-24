# Los Juegos de la Ceniza

Videojuego web multijugador de supervivencia en tiempo real para jugar con amigos desde el móvil o el ordenador,
alojado en tu propio servidor. Inspirado en las distopías de arena televisada, con identidad original.

- Diseño del juego: [`docs/GDD.md`](docs/GDD.md)
- Arquitectura: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Despliegue en Proxmox: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- Estado y avance: [`PROJECT_STATUS.md`](PROJECT_STATUS.md)

## Desarrollo local

Requisitos: Node 22+ y PostgreSQL 16.

```bash
# Base de datos de desarrollo
sudo -u postgres psql -c "CREATE ROLE ceniza LOGIN PASSWORD 'ceniza' CREATEDB;"
sudo -u postgres createdb -O ceniza ceniza
sudo -u postgres createdb -O ceniza ceniza_test     # para las pruebas

npm install
cp .env.example .env     # ajusta: NODE_ENV=development, DATABASE_URL, UPLOAD_DIR=./var/uploads, SERVE_STATIC=false
npm run dev              # servidor en :3000 y web en http://localhost:5173
```
 
## Comandos


| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor (recarga en caliente) + Vite |
| `npm run build` | Compila servidor (`apps/server/dist`) y web (`apps/web/dist`) |
| `npm start` | Arranca la versión compilada |
| `npm test` | Pruebas unitarias e integración (necesita la BD `ceniza_test`) |
| `npm run test:e2e` | Pruebas de extremo a extremo con Chrome (antes `npm run build -w @ceniza/web`) |
| `npm run typecheck` | Comprobación de tipos de todos los paquetes |
| `npm run balance` | Simula los arquetipos por parejas y reescribe `docs/BALANCE.md` |
| `npm run load` | Prueba de carga con 24 jugadores en una partida y reescribe `docs/LOAD.md` |
| `npm run db:generate` | Genera una migración tras cambiar `apps/server/src/db/schema.ts` |
| `npm run admin:promote -w @ceniza/server -- usuario` | Da rol de administrador |

## Estructura

```
packages/shared   reglas del juego, fórmulas y contratos (cliente y servidor)
packages/engine   simulación de la partida: mapa, rutas, tick, pausa, vista por jugador, combate y equilibrio
apps/server       Fastify + Socket.IO + Drizzle (PostgreSQL)
apps/web          React + Vite
deploy/           systemd, Caddy, Nginx, cloudflared y scripts de instalación y copias
docs/             diseño, arquitectura y despliegue
e2e/              pruebas de navegador con varios usuarios.
```
