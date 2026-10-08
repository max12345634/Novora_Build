const { Events } = require('discord.js');
const { sendLog, channelTypeName, field } = require('../utils/auditLog');

module.exports = {
  name: Events.ChannelCreate,
  async execute(channel) {
    if (!channel.guild) return;
    const category = channel.parent;
    await sendLog(channel.guild, 'Neuer Kanal erstellt', {
      description: `${channelTypeName(channel)} **#${channel.name}** wurde erstellt.`,
      fields: [
        field('Name', `#${channel.name}`),
        field('Typ', channelTypeName(channel), true),
        field('Kategorie', category ? category.name : 'Keine', true),
        field('Kanal-ID', `\`${channel.id}\``),
        field('Erstellt am', channel.createdAt ? `<t:${Math.floor(channel.createdTimestamp / 1000)}:F>` : 'Nicht verfügbar', true),
        field('Erstellt von', 'Nicht ermittelt (Novora braucht „Audit-Log anzeigen“)')
      ]
    }, null, channel.id, { auditType: require('discord.js').AuditLogEvent.ChannelCreate, timestamp: channel.createdAt || Date.now() });
  }
};
