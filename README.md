# 09_ELN
09_ELN InnoLab - Electronic Lab Notebook

## Projektstruktur

```
09_eln/
├── src/
│   ├── eln.Backend/          # .NET 8 Backend API
│   ├── eln.Frontend/         # Angular 21 Frontend
│   └── eln.Python/           # Python Microservices
```

---

## Development Setup

### Voraussetzungen
- Docker & Docker Compose
- .NET 8 SDK (optional, für lokale Entwicklung ohne Docker)
- Node.js 20+ (für Frontend-Entwicklung)

### Backend starten (Docker)

```bash
cd src/eln.Backend

# .env Datei erstellen (einmalig)
cp .env.example .env

# Container starten
docker-compose up -d

# Logs anzeigen
docker-compose logs -f
```

### Frontend starten (Development)

```bash
cd src/eln.Frontend/frontend-app
npm install
npm start
```

Frontend läuft dann auf `http://localhost:4200`

### Development Login
- **Username:** `admin`
- **Password:** `11111111`

(Funktioniert nur wenn `ASPNETCORE_ENVIRONMENT=Development`)

---

## Production Deployment (Ubuntu Server)

### Voraussetzungen auf Ubuntu installieren

```bash
# System updaten
sudo apt update && sudo apt upgrade -y

# Docker installieren
sudo apt install -y docker.io docker-compose

# Docker ohne sudo (optional, erfordert Re-Login)
sudo usermod -aG docker $USER

# Prüfen ob Docker läuft
sudo systemctl start docker
sudo systemctl enable docker
docker --version
docker-compose --version
```

### Schritt-für-Schritt Deployment

#### 1. Repository klonen

```bash
git clone <repository-url>
cd 09_eln/src/eln.Backend
```

#### 2. Environment-Datei erstellen

```bash
cp .env.production.example .env.production
nano .env.production   # oder vim/editor deiner Wahl
```

#### 3. Secrets generieren und eintragen

```bash
# Datenbank-Passwort generieren
openssl rand -base64 32

# JWT Secret generieren (MUSS 64+ Bytes sein!)
openssl rand -base64 64
```

Trage die generierten Werte in `.env.production` ein:

```bash
DB_USER=elnuser
DB_PASSWORD=<HIER_GENERIERTES_DB_PASSWORT>
JWT_SECRET=<HIER_GENERIERTES_JWT_SECRET>
CORS_ORIGIN=http://localhost
ASPNETCORE_ENVIRONMENT=Production
```

#### 4. Deployment starten

```bash
chmod +x deploy.sh
./deploy.sh
```

#### 5. Warten & Prüfen

```bash
# Warten bis alles läuft (~1-2 Minuten beim ersten Mal wegen Build)
docker-compose -f docker-compose.production.yml logs -f

# In neuem Terminal: Health Check
curl http://localhost/health
# Erwartete Antwort: {"status":"Healthy"...}
```

#### 6. Zugriff

| Service | URL |
|---------|-----|
| Frontend | `http://localhost` oder `http://<SERVER-IP>` |
| Backend API | `http://localhost:5100` |
| Health Check | `http://localhost/health` |

---

### Häufige Probleme auf Ubuntu

#### Docker Permission Denied
```bash
# Fehler: permission denied while trying to connect to Docker daemon
sudo usermod -aG docker $USER
# WICHTIG: Danach ausloggen und wieder einloggen!
```

#### Port 80 bereits belegt
```bash
# Prüfen was Port 80 nutzt
sudo lsof -i :80

# Apache/Nginx stoppen falls installiert
sudo systemctl stop apache2
sudo systemctl stop nginx
```

#### Container starten nicht
```bash
# Logs prüfen
docker-compose -f docker-compose.production.yml logs backend
docker-compose -f docker-compose.production.yml logs postgres

# Komplett neu starten
docker-compose -f docker-compose.production.yml down
docker-compose -f docker-compose.production.yml up -d --build
```

#### Datenbank-Fehler "column does not exist"
Das passiert NUR wenn eine alte Datenbank existiert. Bei frischer Installation nicht relevant.
```bash
# Migration ausführen (nur bei Updates bestehender Systeme!)
docker exec eln-postgres psql -U elnuser -d elndb -f /scripts/migrate.sql
```

---

### Nützliche Befehle

```bash
# Status aller Container
docker-compose -f docker-compose.production.yml ps

# Logs live verfolgen
docker-compose -f docker-compose.production.yml logs -f

# Nur Backend-Logs
docker-compose -f docker-compose.production.yml logs -f backend

# Container neustarten
docker-compose -f docker-compose.production.yml restart

# Alles stoppen
docker-compose -f docker-compose.production.yml down

# Alles stoppen + Daten löschen (ACHTUNG!)
docker-compose -f docker-compose.production.yml down -v

# In Postgres-Container einloggen
docker exec -it eln-postgres psql -U elnuser -d elndb
```

---

### Checkliste für morgen

- [ ] Ubuntu hat Docker + Docker-Compose installiert
- [ ] Repository geklont
- [ ] `.env.production` erstellt mit:
  - [ ] `DB_PASSWORD` generiert (`openssl rand -base64 32`)
  - [ ] `JWT_SECRET` generiert (`openssl rand -base64 64`)
  - [ ] `CORS_ORIGIN` gesetzt (z.B. `http://localhost` oder Server-IP)
- [ ] `./deploy.sh` ausgeführt
- [ ] Health Check funktioniert: `curl http://localhost/health`
- [ ] Frontend erreichbar: `http://localhost`

---

## Environment Variables Guide

Die `.env.production` Datei enthält alle sensiblen Konfigurationswerte. Hier ist eine detaillierte Anleitung für jeden Wert:

### Datei: `.env.production`

```bash
# ============================================
# PRODUCTION ENVIRONMENT VARIABLES
# ============================================

# ---------- DATABASE ----------
DB_USER=elnuser
DB_PASSWORD=<DEIN_SICHERES_PASSWORT>

# ---------- JWT SECRET ----------
JWT_SECRET=<DEIN_JWT_SECRET>

# ---------- CORS ----------
CORS_ORIGIN=https://deine-domain.com

# ---------- ENVIRONMENT ----------
ASPNETCORE_ENVIRONMENT=Production
```

---

### DB_USER

**Was ist das?**
Der Benutzername für die PostgreSQL Datenbank.

**Empfehlung:**
```
DB_USER=elnuser
```

Du kannst den Standard `elnuser` beibehalten oder einen eigenen wählen.

---

### DB_PASSWORD

**Was ist das?**
Das Passwort für den Datenbank-Benutzer. Wird von der Anwendung verwendet, um sich mit PostgreSQL zu verbinden.

**Wie generieren?**
```bash
# Option 1: OpenSSL (empfohlen)
openssl rand -base64 32

# Option 2: Manuell
# Wähle ein langes, zufälliges Passwort mit Buchstaben, Zahlen und Sonderzeichen
```

**Beispiel:**
```
DB_PASSWORD=Kj8#mP2$vL9nQ4xR7wY1zB6tH3cF0gA5
```

**Wichtig:**
- Mindestens 20 Zeichen
- Keine Leerzeichen
- Keine Anführungszeichen im Passwort selbst

---

### JWT_SECRET

**Was ist das?**
Ein geheimer Schlüssel zum Signieren von JWT (JSON Web Tokens). Wird für die Authentifizierung verwendet. Wenn jemand diesen Schlüssel kennt, kann er gültige Auth-Tokens erstellen.

**Wie generieren?**
```bash
openssl rand -base64 64
```

**Beispiel:**
```
JWT_SECRET=RLTiRZLV4tmbsBivkTR8sZ6ggJJlE13KLn2wthb9auqcIBzZGJ8bmnx+w8p4IRVzN/AIImf8fbkNmS+SWLXhUA==
```

**Wichtig:**
- MUSS mindestens 64 Bytes (512 Bit) lang sein
- NIEMALS teilen oder committen
- Bei Kompromittierung: Neuen Secret generieren (alle User werden ausgeloggt)

---

### CORS_ORIGIN

**Was ist das?**
Die URL des Frontends. Der Backend-Server akzeptiert nur Anfragen von dieser Domain. Das ist ein Sicherheitsfeature gegen Cross-Site Request Forgery (CSRF).

**Beispiele:**
```bash
# Wenn Frontend auf gleicher Maschine läuft
CORS_ORIGIN=http://localhost

# Wenn Frontend auf eigener Domain läuft
CORS_ORIGIN=https://eln.meine-firma.com

# Wenn Frontend auf anderer IP läuft
CORS_ORIGIN=http://192.168.1.100
```

**Wichtig:**
- Kein trailing slash (`https://domain.com` nicht `https://domain.com/`)
- Protokoll muss stimmen (`http://` vs `https://`)
- Bei mehreren Origins: Aktuell nur eine Origin unterstützt

---

### ASPNETCORE_ENVIRONMENT

**Was ist das?**
Bestimmt in welchem Modus die Anwendung läuft.

**Werte:**
```bash
# Production (empfohlen für Deployment)
ASPNETCORE_ENVIRONMENT=Production

# Development (nur für Entwicklung)
ASPNETCORE_ENVIRONMENT=Development
```

**Unterschiede:**

| Feature | Development | Production |
|---------|-------------|------------|
| Swagger UI | Ja | Nein |
| Admin-Login (admin/11111111) | Ja | Nein |
| Detaillierte Fehlermeldungen | Ja | Nein |
| CORS | Alles erlaubt | Nur CORS_ORIGIN |

---

## Vollständiges Beispiel

So könnte eine fertige `.env.production` aussehen:

```bash
# ============================================
# PRODUCTION ENVIRONMENT VARIABLES
# Erstellt am: 2024-01-15
# ============================================

# Database
DB_USER=elnuser
DB_PASSWORD=Kj8#mP2$vL9nQ4xR7wY1zB6tH3cF0gA5sD2pW8

# JWT Secret (generiert mit: openssl rand -base64 64)
JWT_SECRET=X7kP2mN9vB4qL8wR3tY6hJ1cF0gA5sD2pW8eI4uO7xZ3nM6bV9kQ2jH5lT8yG1rE4oU7iP0aS3dF6gH9jK2lZ5xC

# CORS - Frontend URL
CORS_ORIGIN=https://eln.meine-firma.de

# Environment
ASPNETCORE_ENVIRONMENT=Production
```

---

## Database Migration (nur bei Updates)

Wenn du eine **bestehende** Datenbank aktualisierst (nicht bei Neuinstallation):

```bash
# Migration-Script ausführen
docker exec eln-postgres psql -U elnuser -d elndb -f /scripts/migrate.sql

# Oder manuell:
docker exec -it eln-postgres psql -U elnuser -d elndb
\i /scripts/migrate.sql
```

**Hinweis:** Bei einer frischen Installation ist dies NICHT nötig - das Schema wird automatisch erstellt.

---

## Troubleshooting

### Container startet nicht

```bash
# Logs prüfen
docker-compose -f docker-compose.production.yml logs backend

# Häufige Fehler:
# - "JWT secret not configured" → JWT_SECRET in .env.production prüfen
# - "Database connection failed" → DB_PASSWORD prüfen, postgres Container läuft?
```

### Health Check schlägt fehl

```bash
curl http://localhost/health

# Sollte zurückgeben:
# {"status":"Healthy","results":{"database":{"status":"Healthy"}}}
```

### Datenbank zurücksetzen

```bash
# ACHTUNG: Löscht alle Daten!
docker-compose -f docker-compose.production.yml down -v
docker-compose -f docker-compose.production.yml up -d
```

### Logs in Echtzeit

```bash
# Alle Services
docker-compose -f docker-compose.production.yml logs -f

# Nur Backend
docker-compose -f docker-compose.production.yml logs -f backend

# Nur Datenbank
docker-compose -f docker-compose.production.yml logs -f postgres
```

---

## Sicherheitshinweise

1. **Niemals `.env.production` committen** - ist in `.gitignore`
2. **JWT_SECRET regelmäßig rotieren** bei Sicherheitsvorfällen
3. **HTTPS verwenden** in Production (Reverse Proxy wie nginx/traefik davor)
4. **Datenbank-Backups** regelmäßig erstellen:
   ```bash
   docker exec eln-postgres pg_dump -U elnuser elndb > backup_$(date +%Y%m%d).sql
   ```
