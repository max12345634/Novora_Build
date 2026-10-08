const { Events, AuditLogEvent } = require('discord.js');
const { sendLog, field } = require('../utils/auditLog');

module.exports = {
  name: Events.MessageBulkDelete,
  async execute(messages, channel) {
    const guild = channel?.guild || messages.first()?.guild;
    if (!guild || !messages.size) return;
    const samples = [...messages.values()].slice(0, 5).map(message => {
      const who = message.author ? `${message.author.tag || message.author.username}: ` : '';
      return `• ${who}${(message.content || '[Inhalt nicht verfügbar]').slice(0, 140)}`;
    });
    const targetChannelId = channel?.id || messages.first()?.channelId;
    await sendLog(guild, 'Nachrichten gesammelt gelöscht', {
      description: `${messages.size} Nachrichten wurden in <#${targetChannelId}> gesammelt gelöscht.`,
      fields: [field('Gelöscht durch', 'Nicht ermittelt – Discord-Audit-Log wird geprüft'),
        field('Kanal', `#${channel?.name || targetChannelId} (<#${targetChannelId}>)`),
        field('Anzahl', String(messages.size), true),
        field('Beispiele', samples.join('\n') || 'Keine Inhalte im Cache')],
      channelId: targetChannelId
    }, null, targetChannelId, { auditType: AuditLogEvent.MessageBulkDelete, auditChannelId: targetChannelId, timestamp: Date.now() });
  }
};
