# Novora Verify V4.17.5 – vollständige BotHosting-Version

Dies ist ein **Code-Update des bisherigen Novora-Bots**, keine Neuentwicklung. Bestehende Verify-, Rollen-, Sicherheit-, Transkript-, Partner-, Voice-, Fraktions-, Panel-Sync- und OAuth2-Funktionen bleiben erhalten.

## Installation

1. Den Bot auf BotHosting.net **anhalten**; vor dem Update `.env` und **den ganzen Ordner `data/` extern sichern**.
2. Diese ZIP direkt in **`/home/container/`** entpacken; Programmdateien ersetzen, **`.env` und `data/` nicht löschen und nicht überschreiben**. Diese sind nicht in der ZIP.
3. **Node.js 22.12+** verwenden; Abhängigkeiten aus `package.json` installieren lassen (`npm install --omit=dev`, soweit erforderlich). Mit `node index.js` starten.
4. `/setup` → **Alle Panels aktualisieren**: vorhandene Verify-, Ticket-, Partnerschafts-, Bewerbungs- und Fraktionspanels am jeweiligen Discord-Server sicher bearbeiten.
5. Team-Bewerbung im Anwendungspanel öffnen und **Discord-DMs zulassen**. Bei blockierten DMs zeigt Novora eine Fehlermeldung. Nur die Team-Bewerbung kann gestartet werden.

## Tickets und Nachweise

Jede Supportkategorie hat **zwei passende Pflichtfragen**, keine unnötigen weiteren Formularfelder. Die Nutzer können im neu angelegten **privaten Ticketkanal** direkt mit Discords **+** Bilder, Videos und Dokumente anhängen. Der Button „Datei / Screenshot“ erklärt dies. **Es ist kein Datei-Upload-Feld im Discord-Modal**: die Dateien werden im bereits eröffneten privaten Kanal hochgeladen. Das funktioniert unabhängig von neueren, eventuell nicht installierten Modal-FileUpload-APIs.

Beim Schließen werden Nachrichten und Discord-CDN-Anhänge gesichert und danach über token-geschützte Online-Transkripte angeboten. Anhänge bleiben privat im Ordner `data/support-transcripts/<server-id>/`. **Maximal 25 MB pro Datei, insgesamt 120 MB und 80 Dateien pro Ticket.** Bei abgelaufenen/fehlenden Anhang-URLs oder Dateifehlern wird der Ticketkanal **nicht gelöscht**. Dateien sind bewusst nicht im Programmarchiv enthalten.

## Team-Bewerbung per Bot-DM

Das Panel zeigt nur **Server-Team**. Nach Auswahl sendet Novora dem Bewerber eine DM mit dem Button **Bewerbung starten**. Erst nach Klick stellt der Bot nacheinander die Fragen. Nutzer antworten normal im privaten Chat. Der Fortschritt wird in `data/` gespeichert und überlebt Neustarts. **abbrechen** bricht ab, **fortsetzen** wiederholt die aktive Frage. Eine Bewerbung läuft maximal sieben Tage ohne Aktivität. Am Ende entsteht ein privates Team-Bewerbungsticket mit allen Antworten und Teamaktionen. Wird die Ticket-Erstellung vorübergehend blockiert, bleiben die Antworten für ein erneutes **fertig** erhalten. DMs müssen beim Nutzer zugelassen sein; dem Bot kann das nicht automatisch erlaubt werden.

Die fünf Fragen: Discord-/RP-Name, Motivation, Erfahrung, Lösung eines Moderationskonflikts und Verfügbarkeit. Andere Bewerbungsarten sind aus dem **neuen Panel** entfernt; bereits gespeicherte alte Bewerbungen bleiben bestehen und lesbar.

## Partnerschaften

**Neuantrag**: Servername, Einladung, Mitgliederzahl, Werbung (4 Fragen). **Änderung**: Servername plus optionale neue Einladung, Mitgliederzahl und Werbung (4 Fragen). **Kündigung**: Servername und Begründung (2 Fragen). Alle öffnen weiterhin das bestehende private Partnerschafts-Ticket mit Übernahme, Analyse, Entscheidung, Forumveröffentlichung, Änderung, Kündigung, sicheren Transkripten und Feedback.

Partner-Tickets zeigen Bearbeitungsstatus und Nachweise; die Abschluss-DM und Bewertungsnachricht wurden auf **Components V2** umgestellt. Geänderte/gekündigte Partnerbeiträge werden wie bisher bearbeitet bzw. archiviert. Bei Fehlern werden keine automatischen Genehmigungen vergeben.

## Bestehende Systeme / Grenzen

- Der Ed25519-Auto-Updater und die Hash-/Rollback-Prüfungen bleiben im Quellcode erhalten. **Kein unsigniertes Update-Manifest veröffentlicht**.
- `.env`, `data/`, `node_modules/`, private Signierschlüssel, Bot-Token und OAuth-Secret sind **nicht Bestandteil der ZIP**.
- Das AppDeploy-Dashboard wurde am 23.10.2026 separat aktualisiert: es akzeptiert Fallaktionen nur bei ausdrücklich bestätigter Fall-ID und erwarteter Statusänderung. Die ZIP ändert ausschließlich BotHosting-Programmdateien.
- Für Join-/Leave-Nachrichten ist weiterhin der im Developer Portal aktivierte **Server Members Intent** plus `ENABLE_MEMBER_EVENTS=true` in der vorhandenen `.env` nötig.
- Für Voice-Audio und dynamischen Servernamen gelten die V4.3-Voraussetzungen (`@discordjs/voice`, ggf. `ffmpeg`/`espeak`, Voice-Rechte). Kein Voice-Livetest auf BotHosting in diesem Paket.
- **Tests sind lokale automatisierte Tests**; echte Discord-Interaktionen, Rollen-/Forum-Berechtigungen und BotHosting-Start erfordern eine Prüfung nach Installation.

Ausführliche Ergebnisse: `QA-REPORT-V4.11.txt`.

## V4.5 – Zusätzlicher Update-Schutz (23.10.2026)

Die bereits signierte Update-Manifestliste wird nun **unmittelbar vor dem Installieren erneut** geprüft: jede Staging-Datei wird auf SHA-256, Dateigröße und Format kontrolliert. Manipulierte Dateien oder symbolische Links in Update-Quell- und Zielpfaden führen zum Abbruch, ohne den Live-Code zu ersetzen. Neue Programmdateien werden über zufällige, exklusiv angelegte temporäre Dateien eingespielt, statt einen vorhersagbaren `.novora-new`-Namen zu überschreiben. Der bisherige Rollback bei einem Startfehler bleibt erhalten.

**Wichtig:** Diese ZIP ist ein manuelles BotHosting-Update. Der im Bot eingebaute Auto-Updater darf nur von einem extern **gültig Ed25519-signierten** Release-Manifest aktualisieren. Die neue ZIP ist **kein** signiertes OTA-Release und wird nicht automatisch veröffentlicht.

## V4.6 – Sichere Aktualisierung veröffentlichter Panels

Die Funktion `/setup` → „Alle Panels aktualisieren“ überprüft, ob die gespeicherte Nachricht wirklich von diesem Bot stammt. Bei einer alten Embed-Nachricht wird die neue V2-Nachricht zuerst erstellt und ihre ID in `data/` gespeichert, bevor die alte Nachricht gelöscht wird. Bei Fehlern werden die gespeicherte ID und die neu erstellte Nachricht soweit möglich zurückgesetzt. Eine Migration ohne Speicherroutine wird verweigert. Im Fehlerfall das Ergebnis im Setup beachten; bei fehlgeschlagener Rücksetzung können zwei Panel-Nachrichten vorhanden sein und eine manuelle Prüfung ist erforderlich.

## V4.7 – Fehlerfeste Tickets, Bewerbungen und Fraktionsfreigaben

- Supporttickets werden nach einer **erfolgreichen Speicherung** nicht mehr gelöscht, nur weil die öffentliche Panel-Aktualisierung fehlschlägt. Ein Panelproblem wird protokolliert, der private Kanal bleibt erhalten.
- Schlägt die Speicherung eines neuen Supporttickets oder Community-Antrags fehl, wird der noch nicht bestätigte Eintrag aus dem Arbeitsspeicher entfernt und der neu angelegte Kanal nach Möglichkeit gelöscht.
- Eine **nach einem Neustart wiederhergestellte Team-Bewerbung** erkennt einen bereits angelegten offenen Antrag und sendet die Bestätigung erneut, ohne ein zweites Ticket anzulegen.
- Bei **Fraktionsfreigaben** wird die ID eines erstellten Forumthreads vor der endgültigen Entscheidung gespeichert. Nach einem Fehler beim Status-Speichern verwendet ein erneuter Bestätigungsversuch den vorhandenen Beitrag statt einen zweiten zu erstellen. Ein fehlender bereits gespeicherter Forumthread wird nicht automatisch ersetzt, sondern zur manuellen Prüfung gemeldet.
- Nach erfolgreicher Entscheidung führen fehlende oder gelöschte Antragskarten nicht mehr zu einer scheinbar fehlgeschlagenen Freigabe.
- Die Fehlerbehandlung im Support-Modal funktioniert jetzt auch bei abgebrochenen oder fehlgeschlagenen Aktionen ohne `ReferenceError`.

**Einschränkung:** Discord-Forenbeiträge und die lokale Datenbank können nicht in einer einzigen atomaren Transaktion geändert werden. Wenn Discord den Forenbeitrag bereits erstellt hat, die Speicherung seiner ID jedoch scheitert und der Prozess anschließend abstürzt, ist vor einem erneuten Bestätigen eine manuelle Prüfung auf Doppelungen nötig. Die lokale Testsuite simuliert wichtige Fehlerfälle, aber keine echte Discord-API oder BotHosting-Installation.

## V4.8 – Transkript- und Anhangssicherheit (23.10.2026)

- Jede Archivierung erstellt einen **neuen unveränderlichen JSON-Snapshot**. Wenn eine wiederholte Archivierung fehlschlägt, wird die bisherige Transkriptdatei nicht überschrieben. Das bestehende Token zeigt weiter auf die zuletzt bestätigte Version.
- Scheitert das Speichern des Index nach einem möglicherweise bereits erfolgten Datenträger-Commit, bleiben die neu erzeugte JSON-Datei und Anhänge vorsichtshalber erhalten, damit keine auf dem Datenträger gespeicherten Links ins Leere zeigen. **Das kann bei wiederholten Fehlern zusätzlichen Speicher belegen.** Alte Snapshots bitte nicht ungeprüft löschen.
- Der Web-Download von Anhängen lehnt symbolische Links auf Datei oder Anhangordner ab und öffnet Dateien mit `O_NOFOLLOW`. Ein gültiger Link kann dadurch nicht einfach über einen Symlink auf eine andere Datei umgebogen werden.
- Die Token-Zuordnung prüft die Ticket- und Server-ID; ein bereits vergebenes Token kann nicht stillschweigend einem anderen Ticket zugeordnet werden.
- **Datenschutz:** Ein Transkriptlink ist ein geheimer Zugriffstoken (Bearer-Link). Wer den vollständigen Link erhält, kann den Inhalt lesen. Nicht öffentlich teilen. Es gibt weiterhin keine Discord-Login-Pflicht für die Transkriptseite.
- Die Regressionstests simulieren fehlgeschlagene Speicheroperationen und Symlinks. Ein realer Discord-/BotHosting-Test wurde nicht durchgeführt.

## V4.9 – Voice-Support und Begrüßung (23.10.2026)

- Parallele Voice-Beitritte werden pro Server serialisiert; keine doppelten Verbindungen bei gleichzeitigem Betreten.
- Verlässt der letzte Nutzer den Raum während des Beitritts, wird die laufende Verbindung abgebrochen. Fehlende Kanalmitgliedsdaten führen nicht mehr automatisch zum Schließen.
- Kurzzeitige Verbindungsfehler führen zu einer 30-Sekunden-Pause statt zu einer dauerhaften Sperre. Fehler des Audio-Players werden abgefangen und Sitzungen bereinigt.
- Personalisierte Audio-Dateien werden zuerst temporär fertiggestellt und erst danach veröffentlicht.
- Bei einem Speicherfehler für Join-/Leave-Kanäle wird die vorherige Einstellung im Arbeitsspeicher wiederhergestellt.
- **Grenze:** Kein echter Discord-/BotHosting-Livetest; Voice benötigt weiterhin Connect/Speak, und Join/Leave den Server Members Intent.

V4.9-Testergebnisse: 213 insgesamt, 212 bestanden, 0 fehlgeschlagen, 1 übersprungen. Siehe `QA-REPORT-V4.9.txt`.

## V4.10 – Panels, Designkonsistenz und Regression (23.10.2026)

- Alte Discord-Nachrichten mit Text oder Buttons, aber **ohne Embeds**, werden beim Panel-Update nun ebenfalls als Legacy erkannt. Das Discord-Flag `IS_COMPONENTS_V2` entscheidet, ob ein vorhandenes Panel in-place bearbeitet werden darf. Alte Nachrichten werden im sicheren, bereits vorhandenen Migrationspfad ersetzt, der die neue Nachrichten-ID vor dem Löschen der alten speichert.
- Wenn die Bot-Identität beim Aktualisieren nicht verifiziert werden kann, verändert Novora die gespeicherte Nachricht nicht. Fremde Nachrichten werden nicht überschrieben.
- Discord-Antworten ohne neue Nachrichten-ID führen nicht zum Löschen des alten Panels; eine möglicherweise angelegte Ersatznachricht wird soweit möglich entfernt. Scheitert die Rücknahme, fordert die Fehlermeldung zur manuellen Prüfung auf.
- Im Setup heißen Bewerbungen und das Panel nun einheitlich **Team-Bewerbungen**. Die bestehenden DM-Fragen und Daten bleiben erhalten.
- Elf neue Regressionstests. **224 Tests: 223 bestanden, 0 fehlgeschlagen, 1 übersprungen**. Testausführung lokal; Discord/BotHosting nicht live getestet.

**Hinweis:** Wenn Discord eine Ersatznachricht erstellt, aber keine gültige ID liefert oder die Löschung verweigert, kann eine manuelle Prüfung im Panelkanal erforderlich sein. Ein unsigniertes automatisches Update wurde nicht veröffentlicht.

## V4.11 – Zustandsdatei sicher speichern und Abschlussprüfung (23.10.2026)

- `data/state.json` wird jetzt über eine neue, zufällig benannte, exklusiv angelegte temporäre Datei mit `0600`-Rechten gespeichert. Ein alter oder manipulierter `state.json.tmp`-Pfad wird nicht verwendet.
- Die Datei wird vor dem atomaren Ersetzen synchronisiert; das Synchronisieren des Verzeichniseintrags wird versucht, sofern das Hosting-Dateisystem dies unterstützt.
- Scheitert das Schreiben oder Umbenennen, bleibt die letzte erfolgreich gespeicherte `state.json` bestehen. Temporäre Dateien werden soweit möglich entfernt.
- Sechs neue Regressionstests decken Wiederherstellung, Fehlerfälle, Symlinks, Dateirechte und parallele Speicheranforderungen ab.
- Vor einer Live-Installation die vollständige `LIVE-TEST-CHECKLIST-V4.11.md` lesen. **Keine echten Discord-/BotHosting-Interaktionen wurden durchgeführt.**

## V4.17.3 – Wiederherstellung über Container-Neustarts hinweg

Rollback-Sicherungen werden jetzt im konfigurierten Datenverzeichnis unter
`update-backups/` abgelegt. Ein `update-recovery.json`-Journal sperrt den
Bot-Start nach einem abgebrochenen Update, bis eine sichere Wiederherstellung
erfolgt ist. Ein normaler Rollback und ein bestätigtes Update entfernen die
temporären Sicherungen. **Wichtig:** Der Datenordner muss auf dem Hoster
wirklich persistent sein; vorher immer extern sichern. Siehe
`SICHERHEITSUPDATE-V4.17.3.txt`. Keine Änderung an der Ed25519-Vertrauenskette.


## V4.17.4 – Wiederherstellungs-Assistent (nur offline)

Wenn nach einem abgebrochenen Update `data/update-recovery.json` existiert,
blockiert der Supervisor aus Sicherheitsgründen den Start. **Nicht** das Journal
oder den Sicherungsordner löschen, um den Bot zum Starten zu zwingen.

1. Bot auf BotHosting vollständig **stoppen**. `.env` und `data/` extern sichern.
2. Im Botverzeichnis `node scripts/recover-update.js` ausführen. Das ist nur
   eine Vorschau und ändert keine Programmdateien.
3. Nur wenn die Sicherung vollständig und unverändert ist, bewusst
   `node scripts/recover-update.js --apply --i-stopped-bot` ausführen.
4. Nach erfolgreicher Meldung den Bot wieder starten und die Logs prüfen.

Das Journal enthält ab V4.17.4 SHA-256-Prüfsummen der gesicherten Dateien.
Der Assistent verweigert manipulierte Pfade, symbolische Links, fehlende oder
veränderte Backups. Ein unterbrochener Wiederherstellungslauf kann nach dem
Stoppen des Bots erneut ausgeführt werden. **Alte Journale im Schema 1** aus
V4.17.3 werden absichtlich nicht automatisch zurückgespielt: Sie enthalten
keine Hashes. In diesem Sonderfall die Originaldateien aus einer geprüften
externen Sicherung manuell wiederherstellen.

Der Assistent ist kein Auto-Update-Release und veröffentlicht keine Dateien.
`src/updater.js` und `src/supervisor.js` bleiben bewusst von der signierten
Over-the-Air-Dateiliste ausgeschlossen. Für dieses Sicherheitsupdate ist daher
eine einmalige manuelle Installation der ZIP nötig.


## V4.17.5 – Endspurt: Rollback und Fallverwaltung

Der automatische Rollback prüft jetzt **alle gesicherten Dateien** vor der ersten
Wiederherstellung anhand der im persistenten Journal erfassten Größe und
SHA-256-Prüfsumme. Beschädigte oder umgeleitete Sicherungen werden abgewiesen,
und die Wiederherstellungssperre bleibt erhalten. Die einzelnen geprüften
Dateien werden über exklusive temporäre Dateien und atomare Umbenennung
zurückgespielt; eine unterbrochene Kopie überschreibt die Originaldatei nicht.

Im Dashboard können nun auch **wartende Voice-Fälle** tatsächlich geschlossen
werden. Der Bot speichert den Status `closed`, Zeitpunkt und verantwortlichen
Administrator und führt einen Audit-Eintrag. Zuvor wurde fälschlich ein Erfolg
gemeldet, obwohl eine wartende Anfrage offen blieb. Bei Speicherversagen wird
der alte Status im Speicher wiederhergestellt. Bereits geschlossene und gerade
übertragene Fälle werden nicht als erfolgreich geschlossen gemeldet.

Das Control Center prüft serverseitig nach jeder Aktion die vom Bot bestätigte
Fall-ID und den erwarteten Status (`claimed`, `open` oder `closed`). Ein
`HTTP 200` ohne bestätigte Änderung genügt nicht mehr. Diese Website-Änderung
ist separat bereitgestellt; eine echte Discord-/BotHosting-Ende-zu-Ende-
Prüfung ist weiterhin erforderlich.

**Sicherheit:** Dies ist eine manuelle Installations-ZIP, **kein** signiertes
Auto-Update-Release. `src/updater.js` ist Teil der Vertrauensbasis und wird
absichtlich nicht über OTA ersetzt. Bestehende `.env`, `data/`, Transkripte,
Tokens und private Schlüssel sind nicht in der ZIP. Vor Installation extern
sichern; im Fehlerfall `data/update-recovery.json` nicht löschen.

**Offene Punkte:** Privater Ed25519-Schlüssel für die Veröffentlichung,
verifizierte Release-Feed-Bereitstellung und BotHosting-/Discord-Livetest.
Im Website-Backend existiert außerdem noch ein fest codierter PIN; seine
sichere Ablösung benötigt die Einrichtung eines neuen serverseitigen Secrets.
