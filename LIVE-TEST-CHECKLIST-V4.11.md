# Novora Verify V4.11 – praktische Discord-/BotHosting-Livetest-Checkliste

**Status:** Zum manuellen Abarbeiten nach der Installation. Kein Test ist durch die Erstellung dieser Liste bereits bestanden.

**Testumgebung:** Am besten zuerst ein privater Testserver, Testnutzer A (ohne Teamrechte), Testnutzer B (Teamrolle), Admin C, eigener Testkanal und Test-Forum. Bei produktivem Server nie echte Nutzerrechte als Testobjekte verändern. Screenshots/Logs ohne Tokens oder private Daten speichern.

## A. Sicheres Update und Start

- [ ] Bot stoppen, aktuelle ZIP/Dateien sowie `.env` und den gesamten Ordner `data/` **extern** sichern; insbesondere `data/encryption.key` nicht verlieren.
- [ ] Prüfen, dass die ZIP keine `.env`, `data/`, Bot-Tokens, OAuth-Secrets oder privaten Signierschlüssel enthält.
- [ ] ZIP im richtigen BotHosting-Projekt nach `/home/container/` entpacken; `data/` und `.env` nicht löschen.
- [ ] Node.js **22.12+** einstellen; `npm install --omit=dev` ausführen, falls die Plattform Abhängigkeiten nicht automatisch installiert.
- [ ] Startbefehl `node index.js` und vorhandene Umgebungsvariablen prüfen: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` für OAuth, `BOT_PUBLIC_URL` (HTTPS), `WEBSITE_URL` (HTTPS); Werte niemals im Ticket/Chat posten.
- [ ] Startlog zeigt `Novora Verify online ...`, ohne `Cannot find module`, `Invalid token`, `Missing Access` oder ungefangenen Fehler.
- [ ] In Discord `/novora-updates` ausführen und prüfen, ob **4.11.0** angezeigt wird.
- [ ] 5 Minuten beobachten: Bot bleibt online, Speicher/CPU stabil, keine dauernden Neustarts.
- [ ] Neustart auslösen und prüfen, dass `/setup`-Einstellungen und alte Panels erhalten bleiben.

## B. Discord-Berechtigungen und Grundkonfiguration

- [ ] Bot hat auf dem Testserver die tatsächlich benötigten Rechte: Kanäle ansehen, Nachrichten senden, Nachrichtenverlauf lesen, Kanäle verwalten (Tickets), Rollen verwalten (Verify/Partner), Mitglieder verschieben und Verbinden/Sprechen (Voice), Audit-Log anzeigen (Sicherheitslogs).
- [ ] Bot-Rolle steht **über** allen Rollen, die er vergeben oder entfernen soll; keine unnötigen Administratorrechte erteilen.
- [ ] Im Developer Portal sind benötigte Gateway-Intents freigeschaltet: Server Members Intent für Join/Leave; `ENABLE_MEMBER_EVENTS=true` nur, wenn der Intent aktiv ist. Für Bewerbungs-DMs ggf. Message Content Intent und `ENABLE_MESSAGE_CONTENT=true` gemäß tatsächlichem DM-Verhalten prüfen.
- [ ] `/setup` ist für Admins erreichbar; Nicht-Admins können keine geschützten Einstellungen verändern.
- [ ] Falscher/gelöschter Kanal wird mit einer verständlichen Fehlermeldung abgewiesen.

## C. Panels und Components V2

- [ ] Verify-, Ticket-, Partnerschafts-, Team-Bewerbungs- und Fraktionspanel über `/setup` veröffentlichen.
- [ ] Alle Karten zeigen Grafiken/Buttons vollständig, ohne kaputte Anhänge oder doppelte Nachrichten.
- [ ] `/setup` → „Alle Panels aktualisieren“ einmal ausführen und Ergebnisse je Panel notieren.
- [ ] Dasselbe **zweimal** wiederholen: bestehende V2-Panels sollen nicht dupliziert werden.
- [ ] Auf Testserver ein älteres Embed-/Textpanel migrieren; neue ID wird gespeichert, alte Nachricht nach erfolgreicher Migration entfernt.
- [ ] Lösche testweise eine gespeicherte Panelnachricht: Der Bot darf nicht unbemerkt ein zweites öffentliches Panel veröffentlichen.
- [ ] Rechte `Nachrichten verwalten` kurzzeitig im Testkanal entziehen: kontrollierte Fehlermeldung und ggf. Hinweis auf manuelle Doppelungsprüfung.
- [ ] Neustart: Panel-IDs zeigen weiterhin auf existierende, vom Bot verfasste Nachrichten.

## D. Verifizierung, OAuth2 und Dashboard

- [ ] Testnutzer A klickt Verify-Button; OAuth2 öffnet die richtige HTTPS-Domain, mit korrekter Callback-URL im Discord Developer Portal.
- [ ] Testnutzer bestätigt Berechtigungen; Verify-Rolle wird **nur** nach erfolgreichem Abschluss vergeben.
- [ ] Falls eingerichtet: zu entfernende Rolle wird korrekt entfernt; höhergestellte/geschützte Rollen werden nicht unberechtigt verändert.
- [ ] Abbruch des OAuth2-Dialogs gibt keine Verify-Rolle und erzeugt keinen fehlerhaften Erfolgseintrag.
- [ ] Erneute Verifizierung derselben Person ist idempotent; Zähler/Panel aktualisieren sich.
- [ ] `/oauth-status`, `/transfer-consent` und `/transfer-revoke` mit Testnutzer prüfen; Serverbeitritt nur bei ausdrücklich erteilter Zustimmung und erlaubtem Zielserver.
- [ ] Dashboard zeigt den richtigen Server; nicht autorisierte Nutzer dürfen keine fremden Server/Rollen verwalten.
- [ ] Rollenänderungen im Dashboard werden im Auditlog mit Akteur, Ziel und Änderung erfasst; Adminrechte/gefährliche Berechtigungen werden als kritisch gekennzeichnet.

## E. Supporttickets und Nachweise

- [ ] Jede der fünf Ticketkategorien öffnen; die **zwei** Pflichtfragen werden passend angezeigt.
- [ ] Nutzer A kann ein Ticket eröffnen; Kanal ist privat, nur Nutzer A und Team B können lesen.
- [ ] Nutzer ohne Teamrolle kann weder übernehmen noch schließen/entscheiden.
- [ ] Team B übernimmt und gibt ein Ticket frei; Status und zuständiger Bearbeiter werden korrekt angezeigt.
- [ ] In einem Ticket ein kleines Bild und ein PDF per Discord-`+` hochladen; der Upload ist im Ticketkanal, nicht im Formular.
- [ ] Ticket schließen und Transkript öffnen: Nachrichten, Bearbeiter und Anhänge sind korrekt, Link ist nicht öffentlich gepostet.
- [ ] Den Transkriptlink nicht mit unberechtigten Personen teilen; er funktioniert als geheimer Bearer-Link ohne Discord-Login.
- [ ] Testweise Anhang-URL ungültig machen (nur im Test): Bei Sicherungsfehler darf der Ticketkanal nicht gelöscht werden.
- [ ] Testgrenzen prüfen: maximal 25 MB/Datei, 120 MB und 80 Anhänge pro Ticket. Keine realen sensiblen Daten hochladen.
- [ ] Bot während offenem Ticket neu starten; Ticket und Status bleiben erhalten.
- [ ] Öffentliche/private Team-Bewertung im Test abgeben; Ergebnis landet nur im vorgesehenen Kanal.

## F. Partnerschaften

- [ ] Neuantrag mit Servername, Einladung, Mitgliederzahl, Werbetext eröffnen.
- [ ] Team B kann Ticket übernehmen, prüfen, annehmen/ablehnen; Nutzer A nicht.
- [ ] Bei Annahme werden Partnerrolle, korrekter Forumbeitrag und ggf. Nickname gesetzt; keine doppelte Veröffentlichung.
- [ ] Mitgliederschwellen testen: 100, 101, 699, 700 – kleine/mittlere/große Partnerschaft richtig zugeordnet.
- [ ] Änderungsantrag aktualisiert bestehenden Partnerbeitrag statt Duplikat.
- [ ] Kündigung archiviert den vorgesehenen Beitrag und aktualisiert den Partnerstatus.
- [ ] Partnerschaftslogs und Statistik sind nachvollziehbar, keine fremden Serverdaten sichtbar.

## G. Team-Bewerbungen und Fraktionen

- [ ] Team-Bewerbungs-Panel zeigt ausschließlich Server-Team, keine RP-Fraktionsbewerbungen.
- [ ] Nutzer A bekommt eine DM und startet die Bewerbung per Button; fünf Fragen werden nacheinander gestellt.
- [ ] Nach Frage 2 Bot neu starten; `fortsetzen` stellt die aktive Frage wieder her.
- [ ] `abbrechen` beendet die Testbewerbung; neuer Start funktioniert kontrolliert.
- [ ] Nach letzter Antwort entsteht **ein** privates Bewerbungsticket mit allen Antworten; wiederholtes `fertig` erzeugt kein zweites.
- [ ] Team B kann übernehmen/entscheiden, Nutzer A kann nicht selbst genehmigen.
- [ ] Fraktionsantrag für „Legal“ und „Illegal“ testen; jeweils im richtigen Forum veröffentlichen.
- [ ] Freigabe nach simuliertem Fehler wiederholen; Forum auf Doppelbeiträge prüfen.
- [ ] Gespeicherte Entscheidungen bleiben nach Neustart erhalten.

## H. Voice-Support, Welcome und Leave

- [ ] Warteraum/Benachrichtigungskanal/Voice-Vorlage und Teamrolle über `/setup` konfigurieren.
- [ ] Nutzer A betritt Warteraum: genau eine Benachrichtigung und ggf. Begrüßung/Wartemusik.
- [ ] Team B übernimmt; privater Support-Raum entsteht mit passenden Berechtigungen.
- [ ] Zwei Nutzer treten gleichzeitig ein: keine doppelten Bot-Voice-Verbindungen oder verwaisten Räume.
- [ ] Nutzer verlässt Warteraum während Aufbau: keine hängende Voice-Sitzung.
- [ ] Temporären Voice-Verbindungsfehler im Test provozieren: nach ca. 30 Sekunden erneuter Versuch möglich.
- [ ] Support endet: temporärer Kanal wird korrekt geschlossen, Bewertung/Logs erscheinen.
- [ ] Testnutzer tritt Server bei/verlässt ihn: Welcome/Leave werden nur im gewählten Kanal gesendet, sofern Server Members Intent und `ENABLE_MEMBER_EVENTS=true` aktiv sind.
- [ ] Ungültiger Welcome-Kanal führt nicht zum Bot-Absturz.

## I. Sicherheit, Updates und Neustart

- [ ] `/logs-setup` für separaten privaten Kanal, danach `/logs-view`, `/logs-check` und `/logs-export` testen.
- [ ] Testrolle zuweisen/entfernen; Log enthält Akteur, Ziel und Rolle. Gefährliche Rechte nur mit einer eigens erstellten **Testrolle** prüfen.
- [ ] Sicherheitsjournal auf Integrität prüfen; gespeicherte Logs nicht als „unlöschbar“ betrachten – Discord-Nachrichten können durch berechtigte Administratoren gelöscht werden. Lokale manipulationsprüfbare Aufzeichnungen gesondert sichern.
- [ ] `/update-status` aufrufen. **Kein unsigniertes Update** anstoßen; Auto-Updater nur mit gültig signiertem Release verwenden.
- [ ] Mehrfach `data/state.json` speichern lassen (z. B. Setup-Einstellung ändern) und Neustart durchführen; Daten bleiben erhalten.
- [ ] Bei Speicherfehlern Bot anhalten, **vor jeder Reparatur** externes Backup prüfen; `data/` und `encryption.key` nicht löschen.
- [ ] BotHosting-Neustart nach 5 Minuten Betrieb: alle Ticket-, Bewerbungs-, Rollen- und Paneldaten bleiben erhalten.

## J. Abnahmeprotokoll

- Version / ZIP-SHA256: __________________________
- Datum / Uhrzeit: ______________________________
- BotHosting-Node-Version: _______________________
- Testserver-ID (keine Zugangsdaten): ____________
- Tester: _______________________________________
- Erfolgreiche Punkte: ______ / ______
- Fehler (Schritte, Uhrzeit, Logzeilen ohne Geheimnisse): __________________
- Ergebnis: [ ] Freigabe [ ] Freigabe mit Einschränkungen [ ] Nicht freigeben

**Freigabekriterium:** Kein Fehler bei Datenpersistenz, Berechtigungsprüfung, OAuth2-Rollenvergabe, Panelmigration, Ticket-Privatsphäre oder Transkriptsicherung. Alle nicht getesteten Funktionen ausdrücklich als *nicht geprüft* kennzeichnen. Bei kritischen Fehlern vorherige gesicherte Programmversion zurückspielen, `data/` nur nach sorgfältiger Prüfung wiederherstellen.
