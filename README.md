# Novora Build

Grundstruktur fuer den spaeteren Novora / Shadow RP Discord Bot.

## Was ist drin?

- Node.js Bot mit `discord.js`
- Slash Command Loader
- Event Loader
- Beispielcommands `/ping` und `/status`
- sichere Environment Variables ueber `.env`
- BotHosting.net Startdateien
- GitHub Actions Projektcheck
- optionaler Deployment Webhook fuer spaetere Auto-Restarts

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

Das ist nur die saubere Basis. Tickets, Verify, Moderation, Logs, Voice Support, Welcome/Leave, Bewerbungen und Duty-System bauen wir spaeter Schritt fuer Schritt dazu.
