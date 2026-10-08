const { Events, AuditLogEvent } = require('discord.js');
const { sendLog, field } = require('../utils/auditLog');
module.exports = { name: Events.GuildMemberUpdate, async execute(before, after) {
  const changes = [];
  if (before.nickname !== after.nickname) changes.push(field('Servername', `${before.nickname || before.user.username} → ${after.nickname || after.user.username}`));
  const oldRoles = new Set(before.roles.cache.keys()), newRoles = new Set(after.roles.cache.keys());
  const added = [...newRoles].filter(id => !oldRoles.has(id)), removed = [...oldRoles].filter(id => !newRoles.has(id));
  if (added.length) changes.push(field('Rollen hinzugefügt', added.map(id => `<@&${id}>`).join(', ')));
  if (removed.length) changes.push(field('Rollen entfernt', removed.map(id => `<@&${id}>`).join(', ')));
  if (!changes.length) return;
  changes.push(field('Mitglied', `${after.user.tag || after.user.username} (<@${after.id}>)`), field('Nutzer-ID', `\`${after.id}\``),
    field('Geändert durch', 'Nicht ermittelt (Audit-Log-Recht erforderlich)'));
  await sendLog(after.guild, 'Mitglied geändert', { description: `Serverdaten von <@${after.id}> wurden geändert.`, fields: changes }, null, after.id,
    { auditType: added.length || removed.length ? AuditLogEvent.MemberRoleUpdate : AuditLogEvent.MemberUpdate });
} };
