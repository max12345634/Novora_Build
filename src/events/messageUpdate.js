const { Events } = require('discord.js');
const { sendLog } = require('../utils/auditLog');

module.exports = {
  name: Events.MessageUpdate,
  async execute(before, after) {
    if (!after.guild || after.author?.bot || before.content === after.content) return;
    const author = after.author ? '<@' + after.author.id + '>' : 'Unbekannt';
    await sendLog(after.guild, 'Nachricht bearbeitet', 'Kanal: <#' + after.channelId + '>\nPerson: ' + author + '\nVorher: ' + (before.content || '[leer]').slice(0, 900) + '\nNachher: ' + (after.content || '[leer]').slice(0, 900));
  }
};
