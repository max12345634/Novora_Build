const { Events } = require('discord.js');
const { sendLog } = require('../utils/auditLog');

module.exports = {
  name: Events.MessageDelete,
  async execute(message) {
    if (!message.guild || message.author?.bot) return;
    const author = message.author ? '<@' + message.author.id + '>' : 'Unbekannt';
    await sendLog(message.guild, 'Nachricht gelöscht', 'Kanal: <#' + message.channelId + '>\nPerson: ' + author + '\nText: ' + (message.content || '[Inhalt nicht verfügbar]').slice(0, 2500));
  }
};
