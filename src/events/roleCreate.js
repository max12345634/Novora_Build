const { Events, AuditLogEvent } = require('discord.js');
const { sendLog, field } = require('../utils/auditLog');
module.exports = { name: Events.GuildRoleCreate, async execute(role) {
  await sendLog(role.guild, 'Rolle erstellt', { description: `Die Rolle **${role.name}** wurde erstellt.`, fields: [
    field('Rolle', `<@&${role.id}> · ${role.name}`), field('Rollen-ID', `\`${role.id}\``),
    field('Farbe', role.hexColor || 'Standard', true), field('Position', String(role.position), true), field('Erstellt von', 'Nicht ermittelt (Audit-Log-Recht erforderlich)')
  ] }, null, role.id, { auditType: AuditLogEvent.RoleCreate });
} };
