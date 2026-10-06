const { Events } = require('discord.js');
const { sendLog } = require('../utils/auditLog');

module.exports = {
  name: Events.GuildRoleDelete,
  async execute(role) {
    await sendLog(role.guild, 'Rolle gelöscht', role.name + ' (' + role.id + ')');
  }
};
