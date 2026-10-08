const { Events, AuditLogEvent } = require('discord.js');
const { sendLog, field } = require('../utils/auditLog');
module.exports = { name: Events.GuildBanAdd, async execute(ban) {
  await sendLog(ban.guild, 'Mitglied gebannt', { description: `<@${ban.user.id}> wurde vom Server gebannt.`, fields: [
    field('Mitglied', `${ban.user.tag || ban.user.username} (<@${ban.user.id}>)`), field('Nutzer-ID', `\`${ban.user.id}\``),
    field('Grund', ban.reason || 'Kein Grund angegeben'), field('Gebannt durch', 'Nicht ermittelt (Audit-Log-Recht erforderlich)')
  ] }, null, ban.user.id, { auditType: AuditLogEvent.MemberBanAdd });
} };
