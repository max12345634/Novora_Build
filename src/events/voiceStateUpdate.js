const { Events } = require('discord.js');
const { sendLog } = require('../utils/auditLog');

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(before, after) {
    const member = after.member || before.member;
    const guild = after.guild || before.guild;
    if (!member || !guild || before.channelId === after.channelId) return;
    const from = before.channelId ? '<#' + before.channelId + '>' : 'kein Voice-Kanal';
    const to = after.channelId ? '<#' + after.channelId + '>' : 'Voice verlassen';
    await sendLog(guild, 'Voice-Status geändert', '<@' + member.id + '> · ' + from + ' → ' + to);
  }
};
