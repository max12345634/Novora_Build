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

Unter `/setup` → **Logs** wählst du einen Logkanal und Detailgrad: **Basis** für wichtige Ereignisse, **Erweitert** zusätzlich für Kanal-, Rollen- und Mitgliedsänderungen, **Alles** zusätzlich für Nachrichten- und Voice-Ereignisse. Kanal-Logs zeigen Name, Typ, Kategorie, ID, Zeitpunkt und – wenn Discords Audit-Log den Eintrag liefert – wer die Änderung ausgelöst hat. Nachrichten-Logs enthalten Autor, Kanal, Nachrichten-ID, ursprünglichen Zeitstempel und verfügbaren Inhalt. Ticket-Logs protokollieren die Fallnummer, Ersteller, Bearbeiter, Kategorie, Status, Dauer und ausgeführte Aktion. Aktivitäten bleiben außerdem im Ticketdatensatz und im Transcript nachvollziehbar.

Der Logstil verwendet Novoras zentrales Serverbranding und strukturierte Embed-Felder. Das orientiert sich an GalaxyBots Ticket-Abläufen wie Kategorien, Claim, Transcripts und Bewertungen, behält aber Novoras eigenes Design und eigene Inhalte. Referenz: [GalaxyBot Ticket-System](https://galaxybot.app/en/features/ticket-system).

Discord sendet beim [Gateway-Ereignis „Nachricht gelöscht“](https://docs.discord.com/developers/events/gateway-events#message-delete) nur Nachrichten-ID, Kanal-ID und Server-ID; Autor und Inhalt stammen daher nur aus Novoras Nachrichtencache. Wer gelöscht hat, wird bestmöglich über einen passenden Audit-Log-Eintrag gesucht und sonst ausdrücklich als nicht ermittelt markiert. Für Audit-Zugriff braucht Novora **Audit-Log anzeigen**; Discord nennt dieses Recht als Voraussetzung für [Audit-Log-Abfragen](https://docs.discord.com/developers/resources/audit-log). Nachrichteninhalte können im Log erscheinen. Gib nur vertrauenswürdigen Teammitgliedern Zugriff auf den Logkanal.

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

Beim Start registriert Novora die Slash Commands automatisch neu. Auf `main` synchronisiert GitHub Actions nach erfolgreicher Prüfung den BotHosting-Stand und startet den Bot neu; du musst Commands nicht mehr separat registrieren.

## Novora v0.3: Geführtes Setup

`/setup` öffnet die Serververwaltung. Ticket-Einrichtung: Servertyp suchen, Server beschreiben, regelbasierte Vorschläge übernehmen, Kategorien bearbeiten, Kanal/Rolle festlegen und Vorschau prüfen. Die 116 Servertypen werden in 25er-Seiten gefiltert. Die Vorschläge sind editierbare Daten, keine externen KI-Aufrufe. Nach dem Aktivieren wird das bestehende Panel bei Änderungen aktualisiert. Für mehrere Panels ist derzeit ein Panel pro Server vorgesehen.

Unter **Setup → Bot-Design** lassen sich Projektname, Farben und der gemeinsame Footer-Text festlegen. Dieser Footer-Text und das grafische Footer-Bild werden für alle Novora-Panels verwendet. Logo, Banner, Thumbnail, Standardbild und die Bilder der einzelnen Systeme werden direkt aus der Galerie hochgeladen; URL-Eingaben sind dafür nicht nötig. Discord zeigt das grafische Footer-Bild als eigenes Bild direkt unter dem Panel an.

**Einmalige Einrichtung auf iPhone/iPad:** Erstelle in Discord einen privaten Textkanal, zum Beispiel `#novora-assets`, den nur du und der Bot sehen könnt. Öffne `/setup` → **Bot-Design**, wähle diesen Kanal im Feld „Privaten Bilder-Speicherkanal wählen“ und tippe auf **Bilder aus Galerie**. Tippe je Bildfeld auf Datei auswählen und wähle das Bild aus Fotos. Danach kannst du unter Tickets, Verify, Welcome/Leave und Bewerbungen weitere Systembilder genauso hochladen. Der Speicherkanal darf später nicht gelöscht werden, weil dort die gespeicherten Bilddateien liegen.

Der Bot benötigt in diesem Speicherkanal **Kanal ansehen**, **Nachrichten senden**, **Dateien anhängen** und **Links einbetten**. Uploads sind auf PNG, JPG, WEBP oder GIF und 15 MB pro Bild begrenzt. Bot-Name und Bio können im vorhandenen `/branding`-Command geändert werden; Profilbild und Bot-Banner werden dort ebenfalls als Discord-Anhänge ausgewählt.

Bewerbungstypen werden in `/setup → Bewerbungen` hinzugefügt oder über **Typen vorschlagen** anhand der Serverbeschreibung vorbereitet. Vorschläge bleiben zunächst deaktiviert; Name, Emoji und Fragen lassen sich anschließend bearbeiten. Pro Typ können Rolle, Discord-Kategorie und Logkanal festgelegt werden. Tickets unterstützen ebenfalls mehrstufige Formulare mit bis zu 20 Fragen; schreibe `Datei: Screenshot` für eine Discord-Datei-Upload-Frage, `Kurz: Discordname` für ein kurzes Textfeld oder normalen Text für eine längere Antwort. Datei-Fragen erlauben bis zu drei Anhänge.

Unter `/setup → Voice-Support` kann ein öffentlicher Wartekanal, die Supportrolle, ein optionaler Zielordner und ein Textkanal für Benachrichtigungen ausgewählt werden. Beitritt erstellt einen privaten Sprachraum für die anfragende Person und das Team; leere Räume werden entfernt. Das ist ein Sprach-Warteraum mit Team-Ping, kein Discord-internes Funkgerät oder Audio-Brückensystem.

### KI und Daten

Ohne Provider arbeitet Novora mit Presets, Schlüsselwörtern und der pro Server hinterlegten FAQ. `/setup → KI` pflegt Beschreibung, FAQ (`Frage|Antwort` je Zeile), weitere freigegebene Infos/Regeln, Links und Stil. Im selben Dashboard wählst du bis zu fünf Textkanäle, in denen Novora automatisch Fragen beantwortet; mit **Kanal-KI aktivieren** schaltest du sie an und kannst sie jederzeit pausieren. Diese Kanäle und die Wissensbasis bleiben pro Server getrennt. Novora bezieht in einem ausdrücklich ausgewählten Antwortkanal den jüngsten Gesprächsverlauf ein, begrenzt Antworten pro Person und übergibt sensible oder nicht sicher belegbare Fragen an das Team. Dabei kann nur die ausdrücklich konfigurierte Teamrolle erwähnt werden; Antworten können keine freien Nutzer- oder `@everyone`-Pings auslösen. Der Ticket-Antwortmodus bleibt separat.

Unter `/setup → KI → Server analysieren` liest Novora die für den Bot sichtbaren Kanalnamen, Typen und Rollennamen. Es liest dabei keine Nachrichten, DMs oder privaten Ticketinhalte. Danach kannst du den Konfigurationsentwurf übernehmen oder die vorgeschlagenen fünf Textkanäle nach einer zweiten Bestätigung erstellen lassen. Die Kanäle werden öffentlich erstellt; Novora löscht oder verschiebt keine bestehenden Kanäle und verändert keine Rollen oder Rechte. Entwürfe bleiben deaktiviert, bis du sie im Setup einzeln prüfst und aktivierst. Die Analyse funktioniert ohne kostenpflichtige KI per Presets und Regeln. Für einen optionalen OpenAI-kompatiblen HTTPS-Chat-Endpunkt: `NOVORA_AI_ENDPOINT`, `NOVORA_AI_API_KEY`, `NOVORA_AI_MODEL` ausschließlich als BotHosting Environment Variables setzen. Für Antworten in ausgewählten Kanälen und Tickets müssen im Discord Developer Portal **Message Content Intent** eingeschaltet und dem Bot **Kanal ansehen**, **Nachrichten senden**, **Nachrichtenverlauf lesen** sowie **Links einbetten** erlaubt sein.

Im zentralen `/setup` kann der öffentliche Vorlagen-Code **0908** geladen werden. Er stellt ein Novora-Community-Startdesign und universelle Ticket-/Systementwürfe bereit. Bestehende, ausgefüllte Werte bleiben erhalten. Der Code ist kein Passwort und verleiht keine Rechte; beim Laden werden keine Kanäle erstellt und keine Panels aktiviert. Discord-Bots können keine eigenen Schriftfamilien für Embeds festlegen. Deshalb sind zehn auswählbare Farb-/Layoutstile verfügbar.

`data/guild-settings.json` bleibt auf dem Hosting-Server und ist nicht in Git. Beim Laden werden ältere Einstellungen auf Schema 3 ergänzt, ohne sie sofort neu zu schreiben. Vorhandene Ticketdaten bleiben erhalten; ältere Tickets erhalten bei der Migration eine leere Aktivitätshistorie. Schreibvorgänge werden seriell und atomar ausgeführt. Bitte das `data/`-Verzeichnis vor einem Hosting-Wechsel sichern; keine Token in die JSON-Datei schreiben.

`GUILD_ID` in der BotHosting-Umgebung muss auf deinen Discord-Server zeigen, wenn du die Commands dort sofort testen willst. Ist die Variable gesetzt, registriert Novora Befehle nur für diese Guild. Beim Start schreibt Novora die gewählte Server-ID in die Konsole und prüft, ob Discord alle Commands bestätigt hat. Ohne `GUILD_ID` registriert Novora global.

### Automatische Updates von GitHub zu BotHosting

Nur ein erfolgreicher Push oder Merge nach `main` wird ausgerollt: GitHub führt zuerst Projektcheck, Tests und Syntaxprüfung aus und ruft danach BotHosting `sync` auf. BotHosting zieht den Branch `main` und startet den laufenden Bot neu. Beim Neustart trägt `index.js` alle Slash Commands erneut bei Discord ein. Pull Requests und andere Branches werden geprüft, aber nicht live ausgerollt.

Einmalige Einrichtung: BotHosting muss mit `max12345634/Novora_Build` und Branch `main` verknüpft sein. Unter **BotHosting → Account → Developer** einen API-Schlüssel mit dem Scope **`deployments:write`** erstellen. In GitHub auf der Repository-Seite **Settings → Secrets and variables → Actions → New repository secret** öffnen und diese zwei Secrets anlegen:

- `BOT_HOSTING_API_KEY` – der BotHosting-Schlüssel. Nur als GitHub Secret speichern, niemals im Code.
- `BOT_HOSTING_DEPLOYMENT_ID` – die Deployment-ID aus BotHosting, zum Beispiel im Format `dep_…`.

Wenn eines davon fehlt, meldet der Deploy-Job den fehlenden Eintrag klar, statt den Rollout still zu überspringen. Der Bot muss beim Sync laufen; BotHosting startet ihn nach dem GitHub-Pull neu.

### Rechte und Grenzen

Der Bot benötigt für Logs **Kanal ansehen**, **Nachrichten senden** und **Links einbetten**; **Audit-Log anzeigen** ergänzt bei unterstützten Ereignissen den Verursacher. Für Nachrichtentexte benötigt Novora den aktivierten **Message Content Intent**; bei nicht gecachten Nachrichten wird der Inhalt als nicht verfügbar markiert. Für Tickets braucht der Bot **Kanäle verwalten**, **Kanal ansehen**, **Nachrichten senden**, **Nachrichtenverlauf lesen** und **Links einbetten**. Für Verify wird **Rollen verwalten** benötigt; die Botrolle muss über der Verify-Rolle stehen. Für Timeout/Kick sind **Mitglieder moderieren**/**Mitglieder kicken** nötig. Transcripts lesen bis zu 2000 Nachrichten und enthalten HTML und Text; Anhänge werden als Links dokumentiert. Discords Gateway liefert bei einer gelöschten Nachricht nicht den ausführenden Nutzer mit; Novora zeigt ihn nur, wenn ein passender Audit-Eintrag verfügbar ist. Uploads über Discords Größenlimit können im Log scheitern, die Schließung bleibt bestehen. Captcha-Challenges und noch nicht abgeschlossene mehrseitige Formulare sind bewusst kurzlebig und starten nach einem Bot-Neustart neu.

GitHub Actions prüft auf PR und Branch `codex/**` die Befehle, Events, Presets, Komponenten und JS-Syntax. Der BotHosting-Sync läuft erst nach grüner Prüfung auf `main`; ein PR-Build veröffentlicht keine neue Bot-Version.

### Novora Standardbilder und Custom Emojis

Alle Novora-Panels erhalten automatisch ein dunkles Systembanner und einen gemeinsamen `NOVORA`-Footer. Tickets, Verify, Bewerbungen, Welcome/Leave, Voice, Logs und KI haben jeweils ein eigenes Standardmotiv. Eigene Bilder aus der Galerie überschreiben die Standards; der Footer lässt sich zentral unter `/setup` → **Bot-Design** ersetzen.

Im selben Menü kannst du **Novora-Emojis installieren** antippen. Das installiert 27 eigene Symbole direkt bei der Discord-Bot-Anwendung. Novora verwendet sie danach in Embeds, Ticket-Aktionen, Verify-Buttons und Auswahlmenüs auf allen Servern. Dafür sind keine Emoji-Slots oder Nitro-Freischaltungen pro Server nötig. Aus Sicherheitsgründen darf nur der Besitzer der Bot-Anwendung das globale Emoji-Set installieren. Die PNG-Dateien liegen in `assets/emojis/`; Banner und Footer liegen in `assets/banners/` und werden automatisch als Standard verwendet.
