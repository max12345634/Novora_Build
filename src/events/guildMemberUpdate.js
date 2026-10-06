const { Events } = require('discord.js');
const { sendLog } = require('../utils/auditLog');

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(before, after) {
    const changes = [];
    if (before.nickname !== after.nickname) changes.push('Name: ' + (before.nickname || before.user.username) + ' → ' + (after.nickname || after.user.username));
    const oldRoles = new Set(before.roles.cache.keys());
    const newRoles = new Set(after.roles.cache.keys());
    const added = [...newRoles].filter((id) => !oldRoles.has(id));
    const removed = [...oldRoles].filter((id) => !newRoles.has(id));
    if (added.length) changes.push('Rollen hinzugefügt: ' + added.map((id) => '<@&' + id + '>').join(', '));
    if (removed.length) changes.push('Rollen entfernt: ' + removed.map((id) => '<@&' + id + '>').join(', '));
    if (changes.length) await sendLog(after.guild, 'Mitglied geändert', '<@' + after.id + '>\n' + changes.join('\n'));
  }
};
