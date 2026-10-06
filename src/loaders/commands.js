const fs = require('node:fs/promises');
const path = require('node:path');
const { logger } = require('../utils/logger');

async function collectCommandFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectCommandFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function loadCommands(client) {
  const commandsPath = path.join(process.cwd(), 'src', 'commands');
  const commandFiles = await collectCommandFiles(commandsPath);

  for (const filePath of commandFiles) {
    const command = require(filePath);

    if (!command.data || typeof command.execute !== 'function') {
      logger.warn(`Command uebersprungen: ${filePath}`);
      continue;
    }

    client.commands.set(command.data.name, command);
  }

  logger.info(`${client.commands.size} Commands geladen.`);
}

module.exports = { loadCommands, collectCommandFiles };
