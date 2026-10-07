const { Events } = require('discord.js');
const { sendLog } = require('../utils/auditLog');

module.exports = {
  name: Events.GuildBanRemove,
  async execute(ban) {
    await sendLog(ban.guild, 'Ban aufgehoben', 'Ban für ' + ban.user.username + ' wurde aufgehoben.', null, ban.user.id);
  }
};
