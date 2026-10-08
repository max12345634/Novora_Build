const { Events, AuditLogEvent } = require('discord.js');
const { sendLifecycleMessage } = require('../features/welcome');
const { sendLog, resolveActor, field } = require('../utils/auditLog');
const { logger } = require('../utils/logger');
module.exports = { name: Events.GuildMemberRemove, async execute(member) {
  try {
    await sendLifecycleMessage(member, 'leave', member.guild.memberCount);
    const kick = await resolveActor(member.guild, { auditType: AuditLogEvent.MemberKick, targetId: member.id, maxAgeMs: 10_000 });
    await sendLog(member.guild, kick ? 'Mitglied gekickt' : 'Mitglied ausgetreten', {
      description: kick ? `<@${member.id}> wurde vom Server entfernt.` : `<@${member.id}> ist nicht mehr auf dem Server. Ohne passenden Audit-Log-Eintrag kann Discord Austritt und Kick nicht sicher unterscheiden.`,
      fields: [field('Mitglied', `${member.user.tag || member.user.username} (<@${member.id}>)`),
        field('Nutzer-ID', `\`${member.id}\``), field(kick ? 'Gekickt durch' : 'Hinweis', kick ? `<@${kick.id}>` : 'Audit-Eintrag nicht verfügbar'),
        ...(kick?.reason ? [field('Grund', kick.reason)] : [])], actorId: kick?.id, reason: kick?.reason
    });
  } catch (error) { logger.error('Leave-Nachricht konnte nicht gesendet werden.', error); }
} };
