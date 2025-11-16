# ExcelMicroservice (FastAPI)

Microservice für Parsing & Bereinigung von Excel/CSV-Dateien – gedacht als optionaler Service im 09_ELN-Projekt.

## Features
- `POST /parse-excel`: Excel-Datei hochladen, Spalten normalisieren, leere Zeilen entfernen, Vorschau & Schema zurückgeben.
- `POST /parse-csv`: CSV-Datei hochladen, analog zu Excel.
- `GET /health`: Healthcheck.
- CORS konfigurierbar mittels `.env`.

## Quickstart (lokal)
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

## Docker
```bash
docker build -t eln-python-service:latest .
docker run -p 8001:8001 --env-file .env eln-python-service:latest
```
Oder via Compose:
```bash
docker compose up --build
```

## API
- `POST /parse-excel` (Form-Data: `file` = .xlsx/.xls)
- `POST /parse-csv` (Form-Data: `file` = .csv)
- Optionales Query-JSON `mapping` (z. B. `{"zeit":"time","wert":"value"}`) für Spaltenumbenennung.
- Response: Zeilenanzahl, Spaltenliste, 10-Zeilen-Vorschau, Datentyp-Schema, Warnungen.

## Integration (C#-Backend)
Beispiel-Aufruf (HTTP):
```
POST http://eln-python-service:8001/parse-excel
Content-Type: multipart/form-data
```
Danach kann die zurückgegebene JSON-Struktur in die DB geschrieben werden.


```
