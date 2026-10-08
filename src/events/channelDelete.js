const { Events, AuditLogEvent } = require('discord.js');
const { sendLog, channelTypeName, field } = require('../utils/auditLog');

module.exports = {
  name: Events.ChannelDelete,
  async execute(channel) {
    if (!channel.guild) return;
    await sendLog(channel.guild, 'Kanal gelöscht', {
      description: `${channelTypeName(channel)} **#${channel.name}** wurde gelöscht.`,
      fields: [field('Name', `#${channel.name}`), field('Typ', channelTypeName(channel), true),
        field('Kategorie', channel.parent?.name || 'Keine', true), field('Kanal-ID', `\`${channel.id}\``),
        field('Gelöscht durch', 'Nicht ermittelt (Novora braucht „Audit-Log anzeigen“)')]
    }, null, channel.id, { auditType: AuditLogEvent.ChannelDelete, timestamp: Date.now() });
  }
};
