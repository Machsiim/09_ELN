# Backend ToDos für den visuellen Template-Builder

1. **Schema-Struktur finalisieren**
   - Das Frontend sendet jetzt ein strukturiertes Objekt `{ sections: [{ title, cards: [{ title, subtitle, fields: [{ label, type, hint }] }] }] }`.
   - Bitte sicherstellen, dass `Template.Schema` (JSONB) diese verschachtelte Struktur unverändert speichert und beim GET-Endpunkt wieder zurückliefert.
   - Optional: Versions- oder Migrationsstrategie definieren, falls bestehende Templates noch im alten Format liegen.

2. **Validierung/Normalisierung**
   - Serverseitig prüfen, dass mindestens eine Sektion, Karte und Feld vorhanden ist, damit später beim Auswerten keine leeren Layouts auftreten.
   - Ggf. maximale Tiefe und Feldanzahl festlegen, damit große Templates nicht die DB sprengen.

3. **API-Erweiterungen zur Nutzung**
   - Für spätere Messungen braucht es Endpunkte, die anhand eines Templates Eingabe-Formulare generieren bzw. Messergebnisse speichern.
   - Denkbar: `/api/templates/{id}/instantiate` liefert strukturierte Vorgaben (z. B. Default-Werte, Pflichtfelder), damit das Frontend Messdaten erfassen kann.

4. **Medienfelder**
   - Feldtyp `media` dient als Platzhalter für Bild-/Dateigallerien – Backend sollte definieren, wie Assets referenziert oder hochgeladen werden (z. B. separate File-API + Referenzen im Messdatensatz).

5. **Testing & Docs**
   - Neue JSON-Struktur in den API-Dokumentationen beschreiben und Beispielpayloads zur Verfügung stellen.
   - Integrationstests ergänzen, die den kompletten Template-Lifecycle (Create → Fetch → Update) mit der neuen Struktur abdecken.
