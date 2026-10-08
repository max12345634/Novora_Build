const { Events, AuditLogEvent } = require('discord.js');
const { sendLog, field } = require('../utils/auditLog');
module.exports = { name: Events.GuildRoleDelete, async execute(role) {
  await sendLog(role.guild, 'Rolle gelöscht', { description: `Die Rolle **${role.name}** wurde gelöscht.`, fields: [
    field('Rolle', role.name), field('Rollen-ID', `\`${role.id}\``),
    field('Farbe', role.hexColor || 'Standard', true), field('Gelöscht durch', 'Nicht ermittelt (Audit-Log-Recht erforderlich)')
  ] }, null, role.id, { auditType: AuditLogEvent.RoleDelete });
} };
