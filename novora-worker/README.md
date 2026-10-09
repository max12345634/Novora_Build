# Novora AI Core — Cloudflare Worker (read-only prototype)

A separate on-demand service; the existing Novora bot and AppDeploy website stay unchanged. It does **not** include a language model, API key with write permissions, ticket closures or auto moderation.

Routes:
- GET /health returns a minimal status.
- POST /webhook/galaxybot accepts only signed, fresh GalaxyBot events for the configured guild and returns 204. Uses the raw body, 5-minute timestamp window, HMAC-SHA256, Web Crypto verification. No public dashboard.
- Other routes return 404.

## Free Cloudflare deployment
1. Visit https://dash.cloudflare.com/ and create a free Workers account.
2. Workers & Pages > Create application > Import a repository. Connect GitHub, select max12345634/Novora_Build and branch feature/novora-ai-core. Root directory: novora-worker. Deploy command: npm run deploy (install dependencies with npm install).
3. In Worker Settings > Variables and Secrets set GALAXYBOT_WEBHOOK_SECRET (secret; whsec_... from GalaxyBot Webhooks) and GALAXYBOT_GUILD_ID (Discord server ID). Never put secrets in source code or chat.
4. Visit https://<your-worker>.workers.dev/health — should report ok.
5. In GalaxyBot Plus > Server > API > Webhooks select ticket.created, destination https://<your-worker>.workers.dev/webhook/galaxybot.
6. Open a test ticket and check GalaxyBot delivery results and Cloudflare logs for 204.

The Worker only logs minimal event metadata, and does not durably store or deduplicate deliveries yet. Before any write-side effects, implement a durable event store, idempotency, authorization and auditing.

Reference: https://docs.galaxybot.app/de/plus/api
