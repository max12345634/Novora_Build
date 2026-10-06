const fs = require('node:fs/promises');
const path = require('node:path');
const { logger } = require('../utils/logger');

async function loadEvents(client) {
  const eventsPath = path.join(process.cwd(), 'src', 'events');
  const eventFiles = (await fs.readdir(eventsPath)).filter((file) => file.endsWith('.js'));

  for (const fileName of eventFiles) {
    const event = require(path.join(eventsPath, fileName));

    if (!event.name || typeof event.execute !== 'function') {
      logger.warn(`Event uebersprungen: ${fileName}`);
      continue;
    }

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
  }

  logger.info(`${eventFiles.length} Eventdateien geladen.`);
}

module.exports = { loadEvents };
