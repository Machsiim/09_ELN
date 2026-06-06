# 09_ELN - Electronic Lab Notebook

## Projektstruktur

```
src/
├── eln.Backend/          # .NET 8 Backend API
├── eln.Frontend/         # Angular 21 Frontend
└── eln.Python/           # Python Microservices (Excel Export)
```

## Development Setup

**Voraussetzungen:** Docker & Docker Compose, .NET 8 SDK (optional), Node.js 20+

### Mit Docker (empfohlen)

```bash
cp .env.example .env
docker-compose up -d
```

Backend: `http://localhost:5100` | Frontend: `http://localhost:4200`

### Frontend ohne Docker

```bash
cd src/eln.Frontend/frontend-app
npm install
npm start
```

### Admin-Login

Username und Passwort werden über die Env-Vars `ELN_ADMIN_USERNAME` und `ELN_ADMIN_PASSWORD` in der `.env` gesetzt.

## Production Deployment

```bash
cp .env.example .env
```

Secrets generieren und in `.env` eintragen:

```bash
openssl rand -base64 32   # -> DB_PASSWORD
openssl rand -base64 64   # -> JWT_SECRET (mind. 64 Bytes)
```

Starten:

```bash
./deploy.sh
# oder manuell:
docker-compose -f docker-compose.production.yml up -d --build
```

Health Check: `curl http://localhost/health`

| Service | URL |
|---------|-----|
| Frontend | `http://localhost` |
| Backend API | `http://localhost:5100` (intern via `/api/` Proxy durch Nginx) |

Nur das Frontend (Port 80) ist nach außen erreichbar. Backend, Python-Service und Postgres kommunizieren intern über das Docker-Netzwerk. Der Backend-Port-Forward (5100) bleibt nur für Debugging-Zwecke offen.

## Environment Variables

| Variable | Beschreibung |
|----------|-------------|
| `DB_USER` | PostgreSQL-Benutzername (default: `elnuser`) |
| `DB_PASSWORD` | PostgreSQL-Passwort (mind. 20 Zeichen) |
| `JWT_SECRET` | Token-Signierung (mind. 64 Bytes, `openssl rand -base64 64`) |
| `CORS_ORIGIN` | Frontend-URL, kein trailing slash |
| `ASPNETCORE_ENVIRONMENT` | `Development` (Swagger, Seed-Daten) oder `Production` |
| `ELN_ADMIN_USERNAME` | Admin-Benutzername (default: `admin`) |
| `ELN_ADMIN_PASSWORD` | Admin-Passwort |

## Troubleshooting

```bash
# Logs
docker-compose -f docker-compose.production.yml logs -f backend

# DB komplett zurücksetzen (loescht alle Daten!)
docker-compose -f docker-compose.production.yml down -v
docker-compose -f docker-compose.production.yml up -d
```

## Sicherheit

- `.env` niemals committen
- HTTPS via Reverse Proxy (nginx/traefik) in Production
- DB-Backup: `docker exec eln-postgres pg_dump -U elnuser elndb > backup.sql`
