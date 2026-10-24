# Novora Verify 4.18.0

- Fehlenden Release-Dienst im Control Center implementiert; leerer Feed liefert jetzt HTTP 200 mit eindeutigem `empty`-Status statt 404.
- Kontrollierten Ed25519-Schlüsselwechsel umgesetzt. Der neue öffentliche Schlüssel ist nur in der einmalig zu installierenden Botversion und im serverseitigen Veröffentlichungsprüfer hinterlegt.
- Bestehendes `/update-verbinden` wiederverwendet und mit einer ausdrücklichen, persistenten Update-Freigabe versehen.
- `/update-trennen` ergänzt; widerruft die Veröffentlichungsfreigabe, ohne die Signaturprüfung zu beeinflussen.
- Dauerhaften Release-Speicher mit unveränderlichen Hashobjekten, serverseitigem Rücklesen und atomarer Aktivierung implementiert.
- Unsichere/doppelte Pfade und URLs, falsche Signaturen, falsche Hashes, Downgrades und erneute Versionsverwendung werden abgewiesen.
- Feedfehler 404, 403 und 5xx, leerer Feed und „kein neueres Release“ getrennt behandelt.
- Download-Content-Type, Zeitlimit, Dateigröße, Gesamtgröße, SHA-256, Dateiformat, Symlinks und Zielpfade geprüft.
- Freien Speicher vor Installation geprüft; Dateiänderungen zusätzlich synchronisiert.
- Worker-Bereitschaft muss jetzt die tatsächlich gestartete Version melden.
- Gültige unterbrochene Installationen werden beim Neustart automatisch aus dem persistenten Recovery-Journal wiederhergestellt.
- Bis zu fünf geprüfte erfolgreiche Backups bleiben persistent erhalten.
- Dashboard und `/update-status` zeigen reale Feed-, Prüf-, Installations- und Recovery-Zustände.
- Signierwerkzeug gegen Dateisysteme mit getrenntem `/tmp` und Arbeitsverzeichnis repariert.

Alle bisherigen Botfunktionen und vorhandenen Datenbereiche bleiben erhalten. Auto-Updates dürfen `.env`, `data/`, Logs, Backups, installierte Pakete, Supervisor, Updater oder Vertrauensanker nicht ersetzen.
