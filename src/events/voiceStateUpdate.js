const { Events } = require('discord.js');
const { sendLog, field } = require('../utils/auditLog');
const { handleVoiceSupport } = require('../features/voiceSupport');
const { logger } = require('../utils/logger');
module.exports = { name: Events.VoiceStateUpdate, async execute(before, after) {
  try { await handleVoiceSupport(before, after); } catch (error) { logger.warn('Voice-Support-Ereignis fehlgeschlagen.', error); }
  const member = after.member || before.member, guild = after.guild || before.guild;
  if (!member || !guild || before.channelId === after.channelId) return;
  const from = before.channelId ? `<#${before.channelId}>` : 'Kein Sprachkanal';
  const to = after.channelId ? `<#${after.channelId}>` : 'Sprachkanal verlassen';
  await sendLog(guild, 'Voice-Kanal geändert', { description: `<@${member.id}> hat den Voice-Status geändert.`, fields: [
    field('Mitglied', `${member.user.tag || member.user.username} (<@${member.id}>)`), field('Von', from, true), field('Nach', to, true),
    field('Nutzer-ID', `\`${member.id}\``)
  ] });
} };
