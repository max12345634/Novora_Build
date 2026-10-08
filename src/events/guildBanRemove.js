const { Events, AuditLogEvent } = require('discord.js');
const { sendLog, field } = require('../utils/auditLog');
module.exports = { name: Events.GuildBanRemove, async execute(ban) {
  await sendLog(ban.guild, 'Ban aufgehoben', { description: `Der Server-Ban für **${ban.user.tag || ban.user.username}** wurde aufgehoben.`, fields: [
    field('Mitglied', `${ban.user.tag || ban.user.username} (<@${ban.user.id}>)`), field('Nutzer-ID', `\`${ban.user.id}\``),
    field('Aufgehoben durch', 'Nicht ermittelt (Audit-Log-Recht erforderlich)')
  ] }, null, ban.user.id, { auditType: AuditLogEvent.MemberBanRemove });
} };
