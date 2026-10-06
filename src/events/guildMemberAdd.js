const { Events } = require('discord.js');
const { sendLifecycleMessage } = require('../features/welcome');
const { sendLog } = require('../utils/auditLog');
const { logger } = require('../utils/logger');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    try {
      await sendLifecycleMessage(member, 'welcome', member.guild.memberCount);
      await sendLog(member.guild, 'Mitglied beigetreten', '<@' + member.id + '> ist dem Server beigetreten.');
    } catch (error) {
      logger.error('Willkommensnachricht konnte nicht gesendet werden.', error);
    }
  }
};
