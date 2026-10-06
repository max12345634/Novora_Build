const { Events } = require('discord.js');
const { sendLifecycleMessage } = require('../features/welcome');
const { logger } = require('../utils/logger');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    try {
      await sendLifecycleMessage(member, 'welcome', member.guild.memberCount);
    } catch (error) {
      logger.error('Willkommensnachricht konnte nicht gesendet werden.', error);
    }
  }
};
