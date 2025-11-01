# lookappweb

## Widget Testing

Dies ist eine Anleitung, um das Widget in einer lokalen Entwicklungsumgebung zu testen. Befolge die Schritte unten, um das Widget erfolgreich auszuführen.

---

### Voraussetzungen

- Python 3

---

### Schritte zur Ausführung

1. Navigiere in das folgende Verzeichnis:  
   **`lookappweb/src/lookappweb.python`**

2. Widget Server starten:

   ```bash
   python3 widgetserver.py
   
3. HTML Server in einem anderen Terminal-Window starten (wichtig, live server funktioniert wegen CORS nicht):
   ```bash
   python3 -m http.server 5500
