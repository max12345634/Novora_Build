# Novora Build

Grundstruktur fuer den Novora / Shadow RP Discord Bot.

## Was ist enthalten?

- Node.js Bot mit `discord.js`
- Slash Commands `/ping` und `/status`
- Verify Modul mit `/setup verify`
- Welcome- und Leave-Embeds mit `/setup welcome` und `/setup leave`
- Welcome-Platzhalter: `%SERVERNAME%`, `%USERNAME%`, `%MENTION%`, `%TOTALUSERCOUNT%`, `%USERCOUNT%`, `%BOTCOUNT%`
- Sichere Environment Variables; keine echten Secrets in GitHub
- BotHosting.net Startdatei `index.js`
- GitHub Actions Projektcheck und optionaler Deployment Webhook

## Welcome und Leave einrichten

In Discord `/setup welcome` oder `/setup leave` auswaehlen. Der Kanal ist erforderlich. Titel, Text, grosses Bild, Miniatur, Footertext, Footerbild und Farbe sind optional.

Das Footerbild wird als eigenes Embed-Bild direkt unter der Nachricht angezeigt. Bild-URLs muessen direkt auf ein Bild zeigen.

Damit Join- und Leave-Events funktionieren, muss im Discord Developer Portal unter **Bot → Privileged Gateway Intents** der **Server Members Intent** eingeschaltet sein. Die Bot-Rolle braucht im Zielkanal **Kanal ansehen** und **Nachrichten senden**.

## Verify einrichten

Beispiel:

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

Der echte Discord-Token gehoert nur in BotHosting Environment Variables. Er darf niemals ins GitHub-Repository.

## Nach Updates

Slash Commands muessen nach einer Aenderung neu registriert werden:

```bash
npm run deploy:commands
```

Dann den Bot bei BotHosting.net neu starten.
