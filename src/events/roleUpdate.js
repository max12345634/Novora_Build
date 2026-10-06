const { Events } = require('discord.js');
const { sendLog } = require('../utils/auditLog');

module.exports = {
  name: Events.GuildRoleUpdate,
  async execute(before, after) {
    const changes = [];
    if (before.name !== after.name) changes.push('Name geändert: ' + before.name + ' → ' + after.name);
    if (before.color !== after.color) changes.push('Farbe geändert.');
    if (changes.length) await sendLog(after.guild, 'Rolle geändert', '<@&' + after.id + '>\n' + changes.join('\n'));
  }
};
