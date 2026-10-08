const { Events } = require('discord.js');
const { sendLog, field } = require('../utils/auditLog');

module.exports = {
  name: Events.MessageUpdate,
  async execute(before, after) {
    if (!after.guild || before.content === after.content) return;
    await sendLog(after.guild, 'Nachricht bearbeitet', {
      description: `Eine Nachricht wurde in <#${after.channelId}> bearbeitet.`,
      fields: [
        field('Nachrichtenautor', after.author ? `${after.author.tag || after.author.username} (<@${after.author.id}>)` : 'Nicht verfügbar'),
        field('Kanal', `#${after.channel?.name || after.channelId} (<#${after.channelId}>)`),
        field('Nachrichten-ID', `\`${after.id}\``),
        field('Erstellt am', after.createdTimestamp ? `<t:${Math.floor(after.createdTimestamp / 1000)}:F>` : 'Nicht verfügbar'),
        field('Vorheriger Inhalt', (before.content || (before.partial ? 'Nicht verfügbar (Nachricht nicht im Cache)' : 'Leer')).slice(0, 1000)),
        field('Neuer Inhalt', (after.content || 'Leer').slice(0, 1000))
      ], channelId: after.channelId
    }, null, null, { timestamp: Date.now() });
  }
};
