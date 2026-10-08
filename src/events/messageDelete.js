const { Events, AuditLogEvent } = require('discord.js');
const { sendLog, field } = require('../utils/auditLog');

module.exports = {
  name: Events.MessageDelete,
  async execute(message) {
    if (!message.guild) return;
    const author = message.author;
    const channelName = message.channel?.name || message.channelId;
    const content = message.content?.trim() || (message.partial ? 'Nicht verfügbar: Nachricht war nicht im Cache.' : 'Kein Textinhalt.');
    const attachments = [...(message.attachments?.values?.() || [])].map(item => item.url).slice(0, 5);
    await sendLog(message.guild, 'Nachricht gelöscht', {
      description: `Eine Nachricht wurde in <#${message.channelId}> gelöscht.`,
      fields: [
        field('Gelöscht durch', 'Nicht ermittelt – Discord stellt den Löschenden nicht für jeden Löschvorgang bereit'),
        field('Nachrichtenautor', author ? `${author.tag || author.username} (<@${author.id}>)` : 'Nicht verfügbar'),
        field('Kanal', `#${channelName} (<#${message.channelId}>)`),
        field('Nachrichten-ID', `\`${message.id}\``),
        field('Nachricht erstellt', message.createdTimestamp ? `<t:${Math.floor(message.createdTimestamp / 1000)}:F>` : 'Nicht verfügbar'),
        field('Inhalt', content.slice(0, 1000)),
        ...(attachments.length ? [field('Anhänge', attachments.join('\n'))] : [])
      ]
    }, null, author?.id || null, { auditType: AuditLogEvent.MessageDelete, auditChannelId: message.channelId,
      channelId: message.channelId, timestamp: Date.now() });
  }
};
