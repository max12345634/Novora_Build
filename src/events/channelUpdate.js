const { Events } = require('discord.js');
const { sendLog } = require('../utils/auditLog');

module.exports = {
  name: Events.ChannelUpdate,
  async execute(before, after) {
    if (before.name !== after.name && after.guild) {
      await sendLog(after.guild, 'Kanal geändert', before.name + ' → <#' + after.id + '>');
    }
  }
};
