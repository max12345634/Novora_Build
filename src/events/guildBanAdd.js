const { Events } = require('discord.js');
const { sendLog } = require('../utils/auditLog');

module.exports = {
  name: Events.GuildBanAdd,
  async execute(ban) {
    await sendLog(ban.guild, 'Mitglied gebannt', '<@' + ban.user.id + '> wurde gebannt. Grund: ' + (ban.reason || 'Nicht angegeben'), null, ban.user.id);
  }
};
