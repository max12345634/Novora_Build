require('dotenv/config');

const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const { loadCommands } = require('./src/loaders/commands');
const { loadEvents } = require('./src/loaders/events');
const { requireEnv } = require('./src/utils/env');
const { logger } = require('./src/utils/logger');

async function main() {
  const token = requireEnv('BOT_TOKEN');

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User]
  });

  client.commands = new Collection();
  await loadCommands(client);
  await loadEvents(client);
  await client.login(token);
}

main().catch((error) => {
  logger.error('Novora konnte nicht starten.', error);
  process.exit(1);
});
