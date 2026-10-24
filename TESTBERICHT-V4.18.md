# Testbericht Novora Verify 4.18

Prüfdatum: 23.10.2026

## Automatisierte Botprüfung

- `npm run check`: bestanden.
- `npm test`: 297 Tests, 296 bestanden, 0 fehlgeschlagen, 1 historischer Release-Test absichtlich übersprungen.
- Darin enthalten: korrekte Signatur, manipuliertes Manifest, falsche Signatur, manipulierte Datei, leerer Feed, HTTP 404/403/500, abgebrochener Download, falscher Content-Type, Größenlimits, simulierter Speichermangel, Installationsfehler, fehlgeschlagener Workerstart, Rollback, manipuliertes Backup, Symlinks, Crash-Recovery, abgelaufener/wiederverwendeter Verbindungscode und Widerruf.

## Control Center

- Frontend-Produktionsbuild: bestanden.
- Backend-Bündelprüfung: bestanden.
- Statusaufbereitung: 10 von 10 Tests bestanden.
- AppDeploy-Snapshot `1792779807919`: Deploymentstatus `ready`, keine Frontend-, Netzwerk- oder Backendfehler in der Plattformprüfung.
- Öffentlicher Backend-Healthcheck: HTTP 200, JSON.
- Release-Feed ohne Release: HTTP 200, `application/json`, `Cache-Control: no-store`, Inhalt `{"schema":1,"status":"empty"}`.
- Nicht angemeldete Zugriffe auf Releaseverwaltung: HTTP 401.
- Unbekannte Release-Datei: HTTP 404.

## Signierter lokaler Ende-zu-Ende-Test

Ein echtes Release 4.18.1 mit 115 Dateien wurde mit dem neuen Produktionsschlüssel erzeugt und durch den unabhängigen Offline-Prüfer erneut geprüft. Eine isolierte Installation 4.18.0 hat den Feed abgerufen, Ed25519 und sämtliche SHA-256-Werte geprüft, die Dateien installiert, JavaScript geprüft, Version 4.18.1 geladen, vorhandene Test-Benutzerdaten unverändert erhalten und ein persistentes geprüftes Backup angelegt. Ergebnis: bestanden.

Dieser Test verwendete einen kontrollierten lokalen HTTP-Antwortadapter mit den exakten Releasebytes. Er ist kein BotHosting-Livetest.

## Noch ausstehender produktiver Nachweis

Für die erste produktive Veröffentlichung muss der Bot-Eigentümer einmal die V4.18.0-ZIP auf BotHosting installieren, `/update-verbinden` ausführen und das vorbereitete 4.18.1-Release im Control Center veröffentlichen. Erst nach dem danach beobachteten BotHosting-Neustart darf „funktioniert auf BotHosting“ bestätigt werden.
