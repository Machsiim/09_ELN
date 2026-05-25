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

### Backend

```bash
cd src/eln.Backend
cp .env.example .env
docker-compose up -d
```

### Frontend

```bash
cd src/eln.Frontend/frontend-app
npm install
npm start
```

Frontend: `http://localhost:4200`

### Dev-Login

Username `admin` / Password `!ELN_Admin_09!` (nur bei `ASPNETCORE_ENVIRONMENT=Development`)

## Production Deployment

```bash
cd src/eln.Backend
cp .env.production.example .env
```

Secrets generieren und in `.env` eintragen:

```bash
openssl rand -base64 32   # DB_PASSWORD
openssl rand -base64 64   # JWT_SECRET (mind. 64 Bytes)
```

```bash
# .env
DB_USER=elnuser
DB_PASSWORD=<generiert>
JWT_SECRET=<generiert>
CORS_ORIGIN=http://localhost
ASPNETCORE_ENVIRONMENT=Production
```

Starten:

```bash
chmod +x deploy.sh && ./deploy.sh
# oder manuell:
docker-compose -f docker-compose.production.yml up -d --build
```

Health Check: `curl http://localhost/health`

| Service | URL |
|---------|-----|
| Frontend | `http://localhost` |
| Backend API | `http://localhost:5100` |

## Environment Variables

| Variable | Beschreibung |
|----------|-------------|
| `DB_USER` | PostgreSQL-Benutzername (default: `elnuser`) |
| `DB_PASSWORD` | PostgreSQL-Passwort (mind. 20 Zeichen) |
| `JWT_SECRET` | Token-Signierung (mind. 64 Bytes, `openssl rand -base64 64`) |
| `CORS_ORIGIN` | Frontend-URL, kein trailing slash |
| `ASPNETCORE_ENVIRONMENT` | `Development` (Swagger, Admin-Login) oder `Production` |

## Troubleshooting

```bash
# Logs
docker-compose -f docker-compose.production.yml logs -f backend

# DB Migration (nur bei Updates bestehender Systeme)
docker exec eln-postgres psql -U elnuser -d elndb -f /scripts/migrate.sql

# DB komplett zurücksetzen (loescht alle Daten!)
docker-compose -f docker-compose.production.yml down -v
docker-compose -f docker-compose.production.yml up -d
```

## Sicherheit

- `.env` / `.env.production` niemals committen
- HTTPS via Reverse Proxy (nginx/traefik) in Production
- DB-Backup: `docker exec eln-postgres pg_dump -U elnuser elndb > backup.sql`
