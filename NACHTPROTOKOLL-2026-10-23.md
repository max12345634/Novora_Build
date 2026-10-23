# Novora Verify – fortlaufendes Nachtprotokoll, 23.10.2026

## Durchlauf 1 · 01:00 · V4.5.0

**Basis:** NovoraVerify_V4.4_PREMIUM_VOLLVERSION.zip

**Tatsächlich geändert:** `src/updater.js` (erneute Ed25519-/SHA-256-Prüfung vor dem Einspielen; Schutz vor Staging-Manipulation und Symlink-Umleitung; zufällige exklusive Temporärdateien und zweite Hashprüfung vor Commit), `src/version-label.js`, `src/changelog.js`, `src/bot-main.js` (dynamische Panel-Versionsmarke), `package.json`, Versions-/Installationsdokumentation und vier neue Regressionstests.

**Ergebnis:** `npm run check` erfolgreich; `npm test`: 182 insgesamt, 181 bestanden, 0 fehlgeschlagen, 1 übersprungen. Baseline V4.4: 178 insgesamt, 177 bestanden, 0 fehlgeschlagen, 1 übersprungen.

**Nicht durchgeführt:** echter Discord-/BotHosting-Test; keine Veröffentlichung eines signierten OTA-Releases.

**Nächste Prüfung:** `/setup`, gespeicherte Panel-Nachrichten, Wiederherstellung und idempotente Synchronisierung.

**Hinweis für Folgeausführungen:** Immer die neueste geprüfte Vollversions-ZIP aus der ChatGPT-Dateibibliothek laden, diese Datei fortschreiben und die nächste vollständige ZIP unter neuem Versionsnamen dort hochladen. Niemals `.env`, `data/`, Tokens oder private Schlüssel hinzufügen.

## Durchlauf 2 · 02:00 · V4.6.0

**Basis:** `NovoraVerify_V4.5_PREMIUM_VOLLVERSION.zip` aus der ChatGPT-Dateibibliothek.

**Tatsächlich geändert:** `src/panel-sync.js` (Bot-Urheberschaft prüfen; Legacy-Migration speichert neue Panel-ID vor Löschen der alten Nachricht; Wiederherstellung der alten ID und sichere Aufräumlogik bei Fehlern; Migration ohne Persistenz verweigert; ungültige Komponenten kontrolliert behandeln), `src/changelog.js` (doppelter 4.4-Eintrag entfernt), Versions-/Installationsdokumentation und sieben zusätzliche Regressionstests. Tests für die Versionsanzeige verwenden jetzt die gemeinsame `package.json`-Version.

**Ergebnis:** `npm run check` erfolgreich; `npm test`: **189 gesamt, 188 bestanden, 0 fehlgeschlagen, 1 übersprungen**. V4.5-Basis: 182 gesamt, 181 bestanden, 0 fehlgeschlagen, 1 übersprungen.

**Nicht durchgeführt:** echter Discord-/BotHosting-Livetest; keine Veröffentlichung eines signierten OTA-Releases.

**Nächste Prüfung:** Ticket-/Partnerschafts-/Team-Bewerbungs- und Fraktionsabläufe, insbesondere wiederholte Aktionen und Zustandswechsel.

## Durchlauf 3 · 03:00 · V4.7.0

**Basis:** `NovoraVerify_V4.6_PREMIUM_VOLLVERSION.zip` aus der ChatGPT-Dateibibliothek.

**Tatsächlich geändert:** `src/support-suite.js` (persistierte Tickets bei Panel-Fehlern behalten, fehlgeschlagene Ticket-Commits ohne Phantom-Eintrag bereinigen, Fehlerhandler-Scope repariert); `src/community-suite.js` (Bewerbung nach Restart ohne Doppel-Ticket abschließen, unbestätigte Anträge nach Commit-Fehler bereinigen, Forenbeitrag bei Fraktionsfreigabe vor finalem Status persistieren und bei Retry wiederverwenden, Status nach fehlgeschlagenem Commit zurücksetzen, fehlende Antragskarte nach erfolgreicher Entscheidung tolerieren); Testdouble und sechs neue Regressionstests, Versions-/Installationsdokumentation.

**Ergebnis:** `npm run check` erfolgreich; `npm test`: **195 gesamt, 194 bestanden, 0 fehlgeschlagen, 1 übersprungen**. V4.6-Basis: 189 gesamt, 188 bestanden, 0 fehlgeschlagen, 1 übersprungen. ZIP-Integrität geprüft; erneuter Entpacktest mit `npm run check` und `npm test` ebenfalls erfolgreich (195/194/0/1).

**Risiko:** Discord-Thread-Erstellung und lokale Statusspeicherung sind keine gemeinsame Transaktion. Ein Absturz exakt zwischen Forum-Post und Speichern der ID erfordert manuelle Kontrolle, bevor eine Freigabe wiederholt wird. Keine echte Discord-/BotHosting-Verbindung und keine signierte OTA-Veröffentlichung.

**Nächste Prüfung:** Transkripte und Anhänge einschließlich Fehlerbehandlung, Größenlimits, vollständiger Pagination und Zugriffsrechten.

## Durchlauf 4 · 04:00 · V4.8.0

**Basis:** `NovoraVerify_V4.7_PREMIUM_VOLLVERSION.zip` aus der ChatGPT-Dateibibliothek.

**Tatsächlich geändert:** `src/ticket-archive.js` (unveränderliche Transkript-Snapshots pro Archivierung, sichere Wiederholung ohne Überschreiben vorhandener JSON-Dateien, Rücksetzen von Token/Index/Status bei Persistenzfehlern, Bewahren möglicherweise bereits auf Datenträger referenzierter Snapshots, Token-Zuordnung an Ticket/Server gebunden); `src/website.js` (Symlink-Check für Archivordner und Datei, `O_NOFOLLOW` plus `fstat` für Anhangdownloads); bestehender Test für indexbasierte Dateipfade angepasst und sechs neue Regressionstests, Versions-/Installationsdokumentation.

**Ergebnis:** `npm run check` erfolgreich; `npm test`: **201 gesamt, 200 bestanden, 0 fehlgeschlagen, 1 übersprungen**. V4.7-Basis: 195 gesamt, 194 bestanden, 0 fehlgeschlagen, 1 übersprungen. ZIP-Integrität und erneuter Entpacktest werden im Releaseprozess durchgeführt.

**Risiko:** Wiederholte Archivierungen und fehlgeschlagene Index-Commits können zusätzliche Snapshots in `data/` hinterlassen; automatische Löschung wäre bei unklarem Commit gefährlich. Transkriptlinks sind weiterhin private Bearer-Links ohne Discord-Login. Kein Discord-/BotHosting-Livetest; kein unsigniertes OTA-Release.

**Nächste Prüfung:** Voice-/Join-/Leave-Systeme und Fehlertoleranz, anschließend Gesamtdesign und Regression.

## Durchlauf 5 · 05:00 · V4.9.0

**Basis:** `NovoraVerify_V4.8_PREMIUM_VOLLVERSION.zip` aus der ChatGPT-Dateibibliothek.

**Tatsächlich geändert:** `src/voice-audio.js` (parallele Voice-Beitritte serialisiert, Abbruch bei Verlassen während des Starts oder Shutdown, 30-Sekunden-Backoff statt dauerhafter Voice-Sperre, Cleanup bei teilweise fehlgeschlagenen Starts, Schutz gegen veraltete Player-Fehler, Idle-Fehlerbehandlung, temporäre OGG-Dateien erst nach Erfolg veröffentlicht), `src/member-greetings.js` (Rollback der Join-/Leave-Konfiguration bei Persistenzfehlern und Eingabeprüfungen), `tests/v49-voice-greetings-reliability.test.js` (zwölf neue Regressionstests), Versionsnummer, Changelog, README und Installationsdokumentation.

**Ergebnis:** `npm run check` erfolgreich; `npm test`: **213 insgesamt, 212 bestanden, 0 fehlgeschlagen, 1 übersprungen**. V4.8-Basis: 201 insgesamt, 200 bestanden, 0 fehlgeschlagen, 1 übersprungen. Die Tests verwenden simulierte Discord-Voice-Objekte; ein echter Discord- oder BotHosting-Livetest wurde nicht durchgeführt. Kein unsigniertes OTA-Update veröffentlicht.

**Nächste Prüfung:** Gesamtdesign und Regression, insbesondere Versionskonsistenz, Panel-Aktualisierung, Fehlerprotokollierung, Installationsfähigkeit und Security-Regressionen.

## Durchlauf 6 · 06:00 · V4.10.0

**Basis:** `NovoraVerify_V4.9_PREMIUM_VOLLVERSION.zip` aus der ChatGPT-Dateibibliothek.

**Tatsächlich geändert:** `src/message-flags.js` (neue robuste Prüfung des Components-V2-Flags), `src/panel-sync.js` (Text-/Button-Legacy ohne Embeds migrieren, bei unbekannter Bot-Identität nicht bearbeiten, Ersatz ohne ID aufräumen), `src/ui-v2.js` (V2-/Legacy-Erkennung und klarere Rollback-Fehler), `src/setup-flow.js` (nur Team-Bewerbungen in den Setup-Beschriftungen), Versions- und Installationsdokumentation. Zusätzlich elf Regressionstests für Flag-Formate, alte Panels, Fehlerbehandlung und Setup-Texte. Korrigiert: fälschlich als V4.9 betitelter V4.8-Transkript-Eintrag.

**Ergebnis:** `npm run check` erfolgreich; `npm test`: **224 insgesamt, 223 bestanden, 0 fehlgeschlagen, 1 übersprungen**. V4.9-Basis: 213 insgesamt, 212 bestanden, 0 fehlgeschlagen, 1 übersprungen. ZIP-Integrität (291 Dateien) und frischer Entpacktest mit `npm run check` und `npm test` erfolgreich (224/223/0/1); sämtliche 87 JavaScript-Dateien, 79 PNG-Dateien und 2 OGG-Dateien geprüft.

**Risiken:** Keine Live-Verbindung zu Discord/BotHosting; bei einer unerwarteten Discord-Antwort ohne Nachrichten-ID oder gescheiterter Löschung muss der betroffene Kanal manuell auf Doppelungen geprüft werden. Direktes `ui.publish()` hat außerhalb des gesicherten `/setup`-Migrationspfades weiterhin eine nicht atomare ID-Speichergrenze. Kein unsigniertes OTA-Release.

**Nächste Prüfung:** 07:00-Abschlussrunde mit gesamter Testmatrix, ZIP-Integrität, Daten-/Secret-Scan, Installationsdokumentation und zusammenfassender Änderungsliste.

## Durchlauf 7 · 07:00 · V4.11.0

**Basis:** `NovoraVerify_V4.10_PREMIUM_VOLLVERSION.zip` (SHA-256: `6a2f621eb704d0c18ef72eb166fa1bf79d8c221fa6e2bce384a447ac11b32399`).

**Tatsächlich geändert:** `src/store.js` (atomare private Speicherung über exklusiv zufällig angelegte temporäre Dateien, fsync vor Commit, Cleanup bei Fehlern); `tests/v411-persistence.test.js` (sechs neue Regressionstests), Versionsdateien, Changelog, Installationsdokumentation, vollständige Discord-/BotHosting-Livetest-Checkliste.

**Ergebnis:** `npm run check` erfolgreich; `npm test`: **230 insgesamt, 229 bestanden, 0 fehlgeschlagen, 1 übersprungen**. Basis V4.10: 224 insgesamt, 223 bestanden, 0 fehlgeschlagen, 1 übersprungen. Syntaxprüfung sämtlicher 88 JS-Dateien, 79 PNG-Dateien und 2 OGG-Dateien erfolgreich. ZIP-Prüfung und erneuter Entpacktest im Freigabeprozess.

**Einschränkungen:** Kein Discord-/BotHosting-Livetest, keine signierte OTA-Veröffentlichung. Der direkte `ui.publish()`-Migrationspfad außerhalb von `/setup` ist noch nicht vollständig atomar. Der reale Testplan ist `LIVE-TEST-CHECKLIST-V4.11.md`.

## V4.12 – Voice-Cache-Schutz (zusätzlicher Durchlauf)
- Einzigartige WAV-Dateinamen verhindern Kollisionen bei gleichzeitiger Generierung.
- Vorhandene und frisch erzeugte Audio-Dateien werden vor Nutzung auf Mindestgröße geprüft.
- 231 Tests: 230 bestanden, 0 fehlgeschlagen, 1 übersprungen; npm run check erfolgreich.
- Keine Live- oder hochwertige Neural-TTS-Integration behauptet.
