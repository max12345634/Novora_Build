const { Events } = require('discord.js');
const { sendLog } = require('../utils/auditLog');

module.exports = {
  name: Events.ChannelCreate,
  async execute(channel) {
    if (channel.guild) await sendLog(channel.guild, 'Kanal erstellt', '<#' + channel.id + '> (' + channel.type + ')', null, channel.id);
  }
};
