require('dotenv/config');

const path = require('node:path');
const { REST, Routes } = require('discord.js');
const { collectCommandFiles } = require('../src/loaders/commands');
const { requireEnv } = require('../src/utils/env');
const { logger } = require('../src/utils/logger');

async function main() {
  const token = requireEnv('BOT_TOKEN');
  const clientId = requireEnv('CLIENT_ID');
  const guildId = requireEnv('GUILD_ID');

  const commandsPath = path.join(process.cwd(), 'src', 'commands');
  const commandFiles = await collectCommandFiles(commandsPath);
  const commands = [];

  for (const filePath of commandFiles) {
    const command = require(filePath);

    if (command.data) {
      commands.push(command.data.toJSON());
    }
  }

  const rest = new REST({ version: '10' }).setToken(token);

  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  logger.info(`${commands.length} Slash Commands registriert.`);
}

main().catch((error) => {
  logger.error('Slash Commands konnten nicht registriert werden.', error);
  process.exit(1);
});
