const { EmbedBuilder } = require('discord.js');
const { panel } = require('../utils/theme');

function replacePlaceholders(text, member, memberCount) {
  const total = Math.max(0, memberCount);
  const values = {
    '%SERVERNAME%': member.guild.name,
    '%USERNAME%': member.user.username,
    '%MENTION%': '<@' + member.id + '>',
    '%TOTALUSERCOUNT%': String(total),
    '%USERID%': member.id,
    '%CREATEDAT%': member.user.createdAt ? member.user.createdAt.toLocaleDateString('de-DE') : 'Unbekannt',
    '%JOINEDAT%': member.joinedAt ? member.joinedAt.toLocaleDateString('de-DE') : 'Unbekannt',
    '{server}': member.guild.name,
    '{username}': member.user.username,
    '{user}': '<@' + member.id + '>',
    '{mention}': '<@' + member.id + '>',
    '{memberCount}': String(total)
  };
  return Object.entries(values).reduce((result, [placeholder, value]) => result.split(placeholder).join(value), String(text || ''));
}

function validHttpUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function createLifecycleEmbeds(member, settings, memberCount, allSettings = {}) {
  const render = (value) => replacePlaceholders(value, member, memberCount);
  return panel(member.guild, allSettings, { title: render(settings.title || member.guild.name),
    description: render(settings.description || ' '), color: settings.color,
    imageUrl: settings.imageUrl, thumbnailUrl: settings.thumbnailUrl, footerImageUrl: settings.footerImageUrl,
    footerText: render(settings.footerText || '') });
}

async function sendLifecycleMessage(member, kind, memberCount) {
  const { getGuildSettings } = require('../utils/guildSettings');
  const settings = await getGuildSettings(member.guild.id);
  const messageSettings = settings[kind];
  if (!messageSettings?.enabled || !messageSettings.channelId) return;
  const channel = await member.guild.channels.fetch(messageSettings.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  await channel.send({
    embeds: createLifecycleEmbeds(member, messageSettings, memberCount, settings),
    allowedMentions: { users: [member.id], parse: [] }
  });
}

module.exports = { replacePlaceholders, createLifecycleEmbeds, sendLifecycleMessage };
