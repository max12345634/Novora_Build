const { Events } = require('discord.js');
const { sendLifecycleMessage } = require('../features/welcome');
const { sendLog, field } = require('../utils/auditLog');
const { logger } = require('../utils/logger');
module.exports = { name: Events.GuildMemberAdd, async execute(member) {
  try {
    await sendLifecycleMessage(member, 'welcome', member.guild.memberCount);
    await sendLog(member.guild, 'Mitglied beigetreten', { description: `<@${member.id}> ist dem Server beigetreten.`, fields: [
      field('Mitglied', `${member.user.tag || member.user.username} (<@${member.id}>)`), field('Nutzer-ID', `\`${member.id}\``),
      field('Discord-Konto erstellt', member.user.createdAt ? `<t:${Math.floor(member.user.createdTimestamp / 1000)}:F>` : 'Nicht verfügbar'),
      field('Serverbeitritt', member.joinedAt ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'Nicht verfügbar'),
      field('Mitgliederzahl', String(member.guild.memberCount), true)
    ] });
  } catch (error) { logger.error('Willkommensnachricht konnte nicht gesendet werden.', error); }
} };
