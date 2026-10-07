const { Events } = require('discord.js');
const { sendLog } = require('../utils/auditLog');

module.exports = {
  name: Events.GuildRoleCreate,
  async execute(role) {
    await sendLog(role.guild, 'Rolle erstellt', '<@&' + role.id + '> (' + role.name + ')', null, role.id);
  }
};
