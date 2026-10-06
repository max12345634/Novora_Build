const { Events } = require('discord.js');
const { sendLifecycleMessage } = require('../features/welcome');
const { sendLog } = require('../utils/auditLog');
const { logger } = require('../utils/logger');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    try {
      await sendLifecycleMessage(member, 'leave', member.guild.memberCount);
      await sendLog(member.guild, 'Mitglied hat Server verlassen', member.user.username + ' (' + member.id + ')');
    } catch (error) {
      logger.error('Leave-Nachricht konnte nicht gesendet werden.', error);
    }
  }
};
