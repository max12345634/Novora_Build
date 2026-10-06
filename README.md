# Novora Build

Node.js Discord-Bot mit discord.js fuer Novora und Shadow RP.

## Funktionen

- `/ping` und `/status`
- Verify-Panel: `/setup verify`
- Welcome und Leave mit eigenen Embeds: `/setup welcome`, `/setup leave`
- News mit festem Zielkanal: `/setup news`, danach `/news`
- Freie Embed-Nachricht: `/nachricht`
- Servereinstellungen bleiben ausserhalb von GitHub; keine echten Secrets im Repository

## Welcome und Leave

Beim Einrichten kannst du Titel, Text, Kanal, grosses Bild, Miniatur, Footer-Text, Footerbild und Farbe angeben. Das Footerbild wird als separates Bild direkt unter dem Embed gesendet.

Verfuegbare Platzhalter: `%SERVERNAME%`, `%USERNAME%`, `%MENTION%`, `%TOTALUSERCOUNT%`, `%USERCOUNT%`, `%BOTCOUNT%`.

Beispiel fuer den Willkommenstext:

```text
Hey %MENTION%, schoen, dass du da bist! Du bist Mitglied Nummer %TOTALUSERCOUNT%.
```

Join- und Leave-Nachrichten benoetigen den **Server Members Intent**. Schalte ihn im Discord Developer Portal unter **Bot → Privileged Gateway Intents → Server Members Intent** ein.

## News und Embed-Nachrichten

Richte zuerst mit `/setup news` den News-Kanal und optional eine Ping-Rolle ein. Danach kann ein berechtigtes Teammitglied `/news` mit Titel, Nachricht und optionalen Bildern verwenden.

Mit `/nachricht` kannst du eine eigene Nachricht mit Titel, Text, Bild, Miniatur, Footer, Footerbild und Farbe in einen ausgewaehlten Kanal senden.

## Verify

```text
/setup verify kanal:#verify rolle:@Buerger entfernen:@Gast bild:https://... farbe:#5865F2
```

## BotHosting.net

| Einstellung | Wert |
| --- | --- |
| Runtime | Node.js |
| Start File | `index.js` |
| Start Command | `npm start` |
| Install Command | `npm install` |

Der Discord-Token gehoert ausschliesslich in BotHosting Environment Variables, niemals in GitHub.

Nach Code-Aenderungen Slash Commands mit `npm run deploy:commands` neu registrieren und den Bot neu starten.
