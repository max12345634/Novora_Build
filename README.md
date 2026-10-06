# Novora Build

Node.js Discord-Bot mit discord.js fuer Novora und Shadow RP.

## Funktionen

- `/ping` und `/status`
- Verify-Panel: `/setup verify` mit Bild-Captcha und Auswahl
- Welcome/Leave mit eigenen Embeds und Platzhaltern
- News mit festem Kanal: `/setup news`, danach `/news`
- Eigene Embed-Nachricht: `/nachricht`
- Bestellformular mit privatem Ticket: `/setup bestellung`
- Server-Logs: `/setup logs`
- Servereinstellungen liegen ausserhalb von GitHub. Keine echten Secrets im Repository.

## Welcome und Leave

Mit `/setup welcome` und `/setup leave` werden Kanal, Titel, Text, Hauptbild, Miniatur, Footertext, Footerbild und Farbe eingerichtet. Platzhalter: `%SERVERNAME%`, `%USERNAME%`, `%MENTION%`, `%TOTALUSERCOUNT%`.

## Bestell-Tickets

Richte `/setup bestellung` mit Panel-Kanal und Teamrolle ein. Kategorie und Ticket-Logkanal sind optional. Nutzer beantworten ein Formular zu Servername, Zweck, Plattform und gewuenschtem Umfang. Novora erstellt danach einen privaten Ticket-Kanal mit den Antworten und einer Schliessen-Schaltflaeche.

Der Bot benoetigt **Kanaele verwalten**, **Kanaele ansehen**, **Nachrichten senden**, **Nachrichtenverlauf ansehen** und **Einbettungen senden**. Die Teamrolle muss oberhalb der Bot-Rolle stehen. Der Logkanal sollte nur fuer das Team sichtbar sein.

## Server-Logs

`/setup logs kanal:#server-logs` aktiviert Protokolle fuer Nachrichtenbearbeitungen/-loeschungen, Beitritte/Verlaesse, Voice-Wechsel, Bans, Rollen- und Kanaelerstellungen/-aenderungen. Nachrichteninhalte koennen dabei im Log erscheinen. Gib nur vertrauenswuerdigen Teammitgliedern Zugriff auf den Logkanal.

Im Discord Developer Portal unter **Bot → Privileged Gateway Intents** muessen fuer diese Funktionen **Server Members Intent** und **Message Content Intent** eingeschaltet sein. Danach den Bot neu starten.

## News und Embed

Richte zuerst `/setup news` mit einem Kanal und optionaler Ping-Rolle ein. Danach erstellt `/news` Ankuendigungen. `/nachricht` sendet ein eigenes Embed mit Titel, Text, Bildern, Footer und Farbe.

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
