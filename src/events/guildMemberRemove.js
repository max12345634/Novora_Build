const { Events } = require('discord.js');
const { sendLifecycleMessage } = require('../features/welcome');
const { logger } = require('../utils/logger');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    try {
      await sendLifecycleMessage(member, 'leave', member.guild.memberCount);
    } catch (error) {
      logger.error('Leave-Nachricht konnte nicht gesendet werden.', error);
    }
  }
};
