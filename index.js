require('dotenv/config');

const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Partials, REST, Routes } = require('discord.js');
const { loadCommands, collectCommandFiles } = require('./src/loaders/commands');
const { loadEvents } = require('./src/loaders/events');
const { requireEnv } = require('./src/utils/env');
const { logger } = require('./src/utils/logger');

async function registerSlashCommands(token) {
  const clientId = requireEnv('CLIENT_ID');
  const guildId = process.env.GUILD_ID?.trim();
  if (guildId && !/^\d{17,20}$/.test(guildId)) {
    throw new Error('GUILD_ID muss eine gültige Discord-Server-ID mit 17–20 Ziffern sein. Entferne sie für globale Commands oder korrigiere sie in BotHosting.');
  }

  const commandsPath = path.join(process.cwd(), 'src', 'commands');
  const commandFiles = await collectCommandFiles(commandsPath);
  const commands = [];

  for (const filePath of commandFiles) {
    const command = require(filePath);
    if (command.data) commands.push(command.data.toJSON());
  }

  const rest = new REST({ version: '10' }).setToken(token);
  const registered = await rest.put(guildId ? Routes.applicationGuildCommands(clientId, guildId) : Routes.applicationCommands(clientId), { body: commands });
  if (!Array.isArray(registered) || registered.length !== commands.length) {
    throw new Error(`Discord hat ${Array.isArray(registered) ? registered.length : 0} von ${commands.length} Slash Commands bestätigt.`);
  }
  logger.info(`${registered.length} Slash Commands bei Discord ${guildId ? `für Server ${guildId}` : 'global'} registriert.`);
}

async function main() {
  const token = requireEnv('BOT_TOKEN');

  // Bei jedem Neustart werden die aktuellen Commands zuerst mit Discord abgeglichen.
  await registerSlashCommands(token);

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
