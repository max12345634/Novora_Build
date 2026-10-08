const { Events, ActivityType } = require('discord.js');
const { logger } = require('../utils/logger');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    client.application?.emojis.fetch().catch(error => logger.warn('Novora-App-Emojis konnten nicht geladen werden; Unicode-Fallback aktiv.', error));
    client.user.setPresence({
      activities: [
        {
          name: 'Novora Systeme',
          type: ActivityType.Watching
        }
      ],
      status: 'online'
    });

    logger.info(`Novora Ready als ${client.user.tag}`);
  }
};
