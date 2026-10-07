# Novora Build

Node.js Discord-Bot mit discord.js für Community- und Support-Server.

## Funktionen

- `/ping` und `/status`
- Verify-Panel: `/setup verify` mit Bild-Captcha und Auswahl
- Welcome/Leave mit eigenen Embeds und Platzhaltern
- News mit festem Kanal: `/setup news`, danach `/news`
- Eigene Embed-Nachricht: `/nachricht`
- Bestellformular mit privatem Ticket: `/setup bestellung`
- Server-Logs: `/setup logs`
- Moderation: `/moderation warn|verwarnungen|kick|ban|timeout`
- Servereinstellungen liegen ausserhalb von GitHub. Keine echten Secrets im Repository.

## Moderation

`/moderation warn` speichert eine Verwarnung serverbezogen in `data/guild-settings.json`; `/moderation verwarnungen` zeigt die letzten zehn Eintraege. `kick`, `ban` und `timeout` fuehren die jeweilige Discord-Aktion aus. Discord-Berechtigungen und Rollen-Hierarchie werden geprueft. Der Bot braucht die passenden Rechte (Mitglieder kicken, Mitglieder bannen, Mitglieder moderieren). Die optionale Protokollierung erfolgt ueber den mit `/setup logs` eingerichteten Kanal.

## Welcome und Leave

Mit `/setup welcome` und `/setup leave` werden Kanal, Titel, Text, Hauptbild, Miniatur, Footertext, Footerbild und Farbe eingerichtet. Platzhalter: `%SERVERNAME%`, `%USERNAME%`, `%MENTION%`, `%TOTALUSERCOUNT%`.

## Bestell-Tickets

Richte `/setup bestellung` mit Panel-Kanal und Teamrolle ein. Kategorie und Ticket-Logkanal sind optional. Nutzer beantworten ein Formular zu Servername, Zweck, Plattform und gewuenschtem Umfang. Novora erstellt danach einen privaten Ticket-Kanal mit den Antworten und einer Schliessen-Schaltflaeche.

Der Bot benoetigt **Kanaele verwalten**, **Kanaele ansehen**, **Nachrichten senden**, **Nachrichtenverlauf ansehen** und **Einbettungen senden**. Die Teamrolle muss oberhalb der Bot-Rolle stehen. Der Logkanal sollte nur fuer das Team sichtbar sein.

## Server-Logs

`/setup logs kanal:#server-logs` aktiviert Protokolle fuer Nachrichtenbearbeitungen/-loeschungen, Beitritte/Verlaesse, Voice-Wechsel, Bans, Rollen- und Kanaelerstellungen/-aenderungen. Nachrichteninhalte koennen dabei im Log erscheinen. Gib nur vertrauenswuerdigen Teammitgliedern Zugriff auf den Logkanal.

Im Discord Developer Portal unter **Bot → Privileged Gateway Intents** muessen fuer diese Funktionen **Server Members Intent** und **Message Content Intent** eingeschaltet sein. Danach den Bot neu starten.

## News und Embed

Richte zuerst `/setup news` mit einem Kanal und optionaler Ping-Rolle ein. Danach erstellt `/news` Ankündigungen. `/nachricht` sendet ein eigenes Embed mit Titel, Text, Bildern aus der Galerie und Farbe; beide Commands übernehmen das gemeinsame Bot-Design.

## Verify

Beispiel: `/setup verify kanal:#verify rolle:@Buerger entfernen:@Gast`

## BotHosting.net

| Einstellung | Wert |
| --- | --- |
| Runtime | Node.js |
| Start File | `index.js` |
| Start Command | `npm start` |
| Install Command | `npm install` |

Der Discord-Token gehoert ausschliesslich in BotHosting Environment Variables.

Nach Code-Aenderungen muessen Slash Commands mit `npm run deploy:commands` neu registriert und der Bot neu gestartet werden.

## Novora v0.3: Geführtes Setup

`/setup` öffnet die Serververwaltung. Ticket-Einrichtung: Servertyp suchen, Server beschreiben, regelbasierte Vorschläge übernehmen, Kategorien bearbeiten, Kanal/Rolle festlegen und Vorschau prüfen. Die 116 Servertypen werden in 25er-Seiten gefiltert. Die Vorschläge sind editierbare Daten, keine externen KI-Aufrufe. Nach dem Aktivieren wird das bestehende Panel bei Änderungen aktualisiert. Für mehrere Panels ist derzeit ein Panel pro Server vorgesehen.

Unter **Setup → Bot-Design** lassen sich Projektname, Farben und der gemeinsame Footer-Text festlegen. Dieser Footer-Text und das grafische Footer-Bild werden für alle Novora-Panels verwendet. Logo, Banner, Thumbnail, Standardbild und die Bilder der einzelnen Systeme werden direkt aus der Galerie hochgeladen; URL-Eingaben sind dafür nicht nötig. Discord zeigt das grafische Footer-Bild als eigenes Bild direkt unter dem Panel an.

**Einmalige Einrichtung auf iPhone/iPad:** Erstelle in Discord einen privaten Textkanal, zum Beispiel `#novora-assets`, den nur du und der Bot sehen könnt. Öffne `/setup` → **Bot-Design**, wähle diesen Kanal im Feld „Privaten Bilder-Speicherkanal wählen“ und tippe auf **Bilder aus Galerie**. Tippe je Bildfeld auf Datei auswählen und wähle das Bild aus Fotos. Danach kannst du unter Tickets, Verify, Welcome/Leave und Bewerbungen weitere Systembilder genauso hochladen. Der Speicherkanal darf später nicht gelöscht werden, weil dort die gespeicherten Bilddateien liegen.

Der Bot benötigt in diesem Speicherkanal **Kanal ansehen**, **Nachrichten senden**, **Dateien anhängen** und **Links einbetten**. Uploads sind auf PNG, JPG, WEBP oder GIF und 15 MB pro Bild begrenzt. Bot-Name und Bio können im vorhandenen `/branding`-Command geändert werden; Profilbild und Bot-Banner werden dort ebenfalls als Discord-Anhänge ausgewählt.

Bewerbungstypen werden in `/setup → Bewerbungen → Bearbeiten` hinzugefügt. Eine Frage je Zeile, bis zu 20 Fragen; die Formulare öffnen sich in mehreren Schritten mit höchstens fünf Eingaben pro Modal. Typen lassen sich in der JSON-Konfiguration individuell mit `roleId`, `parentId`, `logChannelId`, `imageUrl` und `enabled` versehen. Tickets verwenden das gleiche Fragenformat pro Kategorie. Für komplexere Datenfelder, beispielsweise Ping-Rollen und Cooldowns, ist derzeit die JSON-Konfiguration erforderlich.

### KI und Daten

Ohne Provider arbeitet Novora mit Presets, Schlüsselwörtern und der pro Server hinterlegten FAQ. `/setup → KI` pflegt Beschreibung, FAQ (`Frage|Antwort` je Zeile), weitere freigegebene Infos/Regeln, Links und Stil. Im selben Dashboard wählst du einen Textkanal, in dem Novora automatisch Fragen beantwortet; mit **Kanal-KI aktivieren** schaltest du ihn an und kannst ihn jederzeit pausieren. Der Antwortkanal ist pro Server getrennt. Novora bezieht auf Wunsch den jüngsten Gesprächsverlauf ein, begrenzt Antworten pro Person und übergibt sensible oder nicht sicher belegbare Fragen an das Team. Der Ticket-Antwortmodus bleibt separat. Für einen optionalen OpenAI-kompatiblen HTTPS-Chat-Endpunkt: `NOVORA_AI_ENDPOINT`, `NOVORA_AI_API_KEY`, `NOVORA_AI_MODEL` ausschließlich als BotHosting Environment Variables setzen. Pro Anfrage werden nur Wissen und Nachrichten desselben Discord-Servers übertragen. Für Antworten im Kanal und automatische Ticketantworten müssen im Discord Developer Portal **Message Content Intent** aktiviert und dem Bot **Nachrichtenverlauf lesen** erlaubt sein. Ohne API-Schlüssel bleibt der sichere FAQ-/Regelmodus verfügbar; freie generative Antworten benötigen einen konfigurierten Provider.

`data/guild-settings.json` bleibt auf dem Hosting-Server und ist nicht in Git. Beim Laden werden ältere Einstellungen auf Schema 2 ergänzt, ohne sie sofort neu zu schreiben. Schreibvorgänge werden seriell und atomar ausgeführt. Bitte das `data/`-Verzeichnis vor einem Hosting-Wechsel sichern; keine Token in die JSON-Datei schreiben.

Für mehrere Server `GUILD_ID` in der BotHosting-Umgebung entfernen. Novora registriert Slash Commands dann global; deren Sichtbarkeit kann nach Discord-Änderungen etwas verzögert sein. Mit `GUILD_ID` bleiben die Commands auf diesen Testserver beschränkt. Bestehende Installationen mit `GUILD_ID` laufen unverändert weiter.

### Rechte und Grenzen

Der Bot benötigt `Kanäle verwalten`, `Kanal ansehen`, `Nachrichten senden`, `Links einbetten`, `Nachrichtenverlauf lesen` und für Verify `Rollen verwalten`; seine Rolle muss über der Verify-Rolle stehen. `Audit-Log ansehen` ergänzt bei bestimmten Ereignissen einen wahrscheinlichen Akteur. Für Timeout/Kick sind `Mitglieder moderieren`/`Mitglieder kicken` nötig. Transcripts lesen bis zu 2000 Nachrichten und enthalten HTML und Text; Anhänge werden als Links dokumentiert. Uploads über Discords Größenlimit können im Log scheitern, die Schließung bleibt bestehen. Captcha-Challenges und noch nicht abgeschlossene mehrseitige Formulare sind bewusst kurzlebig und starten nach einem Bot-Neustart neu.

GitHub Actions prüft auf PR und Branch `codex/**` die Befehle, Events, Presets, Komponenten und JS-Syntax. Der BotHosting-Deploy-Workflow löst nur bei Push auf `main` aus und nur wenn `BOT_HOSTING_WEBHOOK_URL` als GitHub Secret eingerichtet ist. Ein PR-Build veröffentlicht keine neue Bot-Version.
