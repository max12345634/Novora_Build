const { Events, AuditLogEvent } = require('discord.js');
const { sendLog, field } = require('../utils/auditLog');
module.exports = { name: Events.GuildRoleUpdate, async execute(before, after) {
  const changes = [];
  if (before.name !== after.name) changes.push(field('Name', `${before.name} → ${after.name}`));
  if (before.hexColor !== after.hexColor) changes.push(field('Farbe', `${before.hexColor} → ${after.hexColor}`, true));
  if (before.hoist !== after.hoist) changes.push(field('Separat anzeigen', `${before.hoist ? 'Ja' : 'Nein'} → ${after.hoist ? 'Ja' : 'Nein'}`, true));
  if (before.mentionable !== after.mentionable) changes.push(field('Erwähnbar', `${before.mentionable ? 'Ja' : 'Nein'} → ${after.mentionable ? 'Ja' : 'Nein'}`, true));
  if (!changes.length) return;
  changes.push(field('Rolle', `<@&${after.id}>`), field('Rollen-ID', `\`${after.id}\``), field('Bearbeitet von', 'Nicht ermittelt (Audit-Log-Recht erforderlich)'));
  await sendLog(after.guild, 'Rolle geändert', { description: `Einstellungen von **${after.name}** wurden geändert.`, fields: changes }, null, after.id,
    { auditType: AuditLogEvent.RoleUpdate });
} };
