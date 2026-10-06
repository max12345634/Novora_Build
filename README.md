# Novora Build

Grundstruktur fuer den spaeteren Novora / Shadow RP Discord Bot.

## Was ist drin?

- Node.js Bot mit `discord.js`
- Slash Command Loader
- Event Loader
- Beispielcommands `/ping` und `/status`
- Verify Modul mit `/setup verify`
- sichere Environment Variables ueber `.env`
- BotHosting.net Startdateien
- GitHub Actions Projektcheck
- optionaler Deployment Webhook fuer spaetere Auto-Restarts

## Verify Modul

Der erste Verify-Stand ist ohne KI und ohne extra Captcha-Abhaengigkeiten gebaut.

Ablauf:

1. Team nutzt `/setup verify`.
2. Der Bot sendet ein Verify Panel mit Embed und Button.
3. Nutzer klickt auf `Verifizieren`.
4. Der Bot zeigt einen zufaelligen Captcha-Code und ein Auswahlmenue.
5. Richtige Auswahl: `Verifizierung erfolgreich`, Rolle wird gegeben, optionale alte Rolle wird entfernt.
6. Falsche Auswahl: Fehlernachricht, danach Kick nach 5 Sekunden.

Beispiel fuer die Einrichtung:

```text
/setup verify kanal:#verify rolle:@Buerger entfernen:@Gast bild:https://... farbe:#5865F2
```

Hinweis: Bilder werden aktuell per URL eingetragen. Galerie-/Dashboard-Upload bauen wir spaeter als eigenes Modul.

## Wichtig: Secrets niemals in GitHub speichern

Der echte Discord Bot Token gehoert nur in BotHosting.net als Environment Variable.

Diese Werte brauchst du spaeter:

```env
BOT_TOKEN=dein_discord_bot_token
CLIENT_ID=deine_discord_application_id
GUILD_ID=deine_test_server_id
```

Optional fuer spaeteres Auto-Deployment:

```env
BOT_HOSTING_WEBHOOK_URL=https://...
```

## BotHosting.net Einstellungen

Nutze diese Werte:

| Einstellung | Wert |
| --- | --- |
| Runtime | Node.js |
| Start File | `index.js` |
| Start Command | `npm start` |
| Install Command | `npm install` |

Bei BotHosting.net unter Environment Variables eintragen:

- `BOT_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`

## Lokale Befehle

```bash
npm install
npm run check
npm start
```

Slash Commands neu hochladen:

```bash
npm run deploy:commands
```

## Aktueller Stand

Die Basis und Verify sind drin. Welcome/Leave, Nachrichten/Embed Maker, News, Bestellsystem, Logs, Moderation, Voice Support, Bewerbungen und Duty-System bauen wir Schritt fuer Schritt dazu.
