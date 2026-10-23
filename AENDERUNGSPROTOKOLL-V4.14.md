# Novora Verify V4.14 – Allgemeine Community-Systeme

Basis: Novora Verify V4.13. Änderungen am vorhandenen Bot, ohne bestehende Daten zu löschen.

## Implementiert
- Giveaway: `/giveaway`, Teilnahmebutton und manuelle Auslosung nach Laufzeit mit kryptografisch zufälliger Gewinnerwahl.
- Rollen-Panel: `/rollen-panel` mit Rollen-Button und Prüfungen gegen Administrator-/ManageGuild-Rollen und Rollen oberhalb des Bots.
- Vorschläge: `/vorschlag`, Abstimmungsbutton und `/vorschlag-status` für Administratoren.
- Moderation: `/warnung`, `/warnungen` mit Berechtigungsprüfung und auf 100 Einträge pro Nutzer begrenztem Verlauf.
- Level/XP: `/rank`, 10 XP je qualifizierter Nachricht, 60 Sekunden Cooldown pro Mitglied und Server. Nachrichtentext-Intent muss für XP aktiviert sein (`ENABLE_MESSAGE_CONTENT=true` und Discord Developer Portal).
- Events: `/event-erstellen`, An-/Abmeldebutton, `/event-liste`.
- RP-Start, RP-Ende, RP-Status bleiben als Slash-Befehle. RP-Dienst und RP-Vorfallmeldungen werden nicht mehr registriert. Vorhandene gespeicherte RP-Dienst- und Meldungsdaten werden aus Migrationssicherheit **nicht gelöscht**.
- Neue Community-Daten im bestehenden `state.json` unter `standardSystems` je Server. Speicherung mit Rollback des Arbeitsspeichers bei fehlgeschlagenem Persist.

## Tests
- `npm run check`: bestanden.
- `npm test`: 245 Tests, 244 bestanden, 0 fehlgeschlagen, 1 übersprungen.
- 7 neue Tests zu Registrierung, Speicherung, Berechtigungen, Rollback und XP/Event.
- ZIP-Integrität separat geprüft.

## Offene Grenzen
- Noch **keine vollständige `/setup`-Menüintegration** für die sechs neuen Systeme; Einrichtung über Slash-Befehle. Rollen-Panel, Giveaway, Vorschlag und Event senden die Bedienbuttons direkt in den Kanal, sind aber noch nicht in der zentralen Panel-Synchronisation registriert.
- Giveaway-Auslosung wird manuell nach Ablauf gestartet, nicht zeitgesteuert.
- Vorschläge und Events nutzen den vorhandenen Datenspeicher, aber noch keine automatische Archivbereinigung.
- Moderation umfasst Verwarnungen, noch keine Timeout-/Ban-Workflows.
- Keine echten Discord-/BotHosting-Livetests; Discord-Rechte, Befehlsregistrierung und Persistenz im Hosting prüfen.
- `data/`, `.env`, Tokens und private Schlüssel bleiben außerhalb des ZIPs. Keine automatische unsignierte Veröffentlichung.
