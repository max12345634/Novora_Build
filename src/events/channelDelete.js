const { Events } = require('discord.js');
const { sendLog } = require('../utils/auditLog');

module.exports = {
  name: Events.ChannelDelete,
  async execute(channel) {
    if (channel.guild) await sendLog(channel.guild, 'Kanal gelöscht', channel.name + ' (' + channel.id + ')', null, channel.id);
  }
};
