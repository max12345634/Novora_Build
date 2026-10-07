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

    const invoke = (...args) => Promise.resolve().then(() => event.execute(...args))
      .catch((error) => logger.error(`Event ${event.name} fehlgeschlagen.`, error));
    if (event.once) client.once(event.name, invoke);
    else client.on(event.name, invoke);
  }

  logger.info(`${eventFiles.length} Eventdateien geladen.`);
}

module.exports = { loadEvents };
