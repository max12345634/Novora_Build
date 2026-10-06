const { EmbedBuilder } = require('discord.js');

function replacePlaceholders(text, member, memberCount) {
  const total = Math.max(0, memberCount);
  const users = member.guild.members.cache.filter((entry) => !entry.user.bot).size;
  const bots = member.guild.members.cache.filter((entry) => entry.user.bot).size;
  const values = {
    '%SERVERNAME%': member.guild.name,
    '%USERNAME%': member.user.username,
    '%MENTION%': '<@' + member.id + '>',
    '%TOTALUSERCOUNT%': String(total),
    '%USERCOUNT%': String(users),
    '%BOTCOUNT%': String(bots),
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

function createLifecycleEmbeds(member, settings, memberCount) {
  const render = (value) => replacePlaceholders(value, member, memberCount);
  const embed = new EmbedBuilder()
    .setColor(settings.color || 0x5865f2)
    .setDescription(render(settings.description || ''))
    .setFooter({ text: render(settings.footerText || member.guild.name) });

  const title = render(settings.title || '');
  if (title) embed.setTitle(title);
  const imageUrl = validHttpUrl(settings.imageUrl);
  const thumbnailUrl = validHttpUrl(settings.thumbnailUrl);
  if (imageUrl) embed.setImage(imageUrl);
  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);

  const embeds = [embed];
  const footerImageUrl = validHttpUrl(settings.footerImageUrl);
  if (footerImageUrl) embeds.push(new EmbedBuilder().setImage(footerImageUrl));
  return embeds;
}

async function sendLifecycleMessage(member, kind, memberCount) {
  const { getGuildSettings } = require('../utils/guildSettings');
  const settings = await getGuildSettings(member.guild.id);
  const messageSettings = settings[kind];
  if (!messageSettings?.enabled || !messageSettings.channelId) return;

  const channel = await member.guild.channels.fetch(messageSettings.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  await channel.send({
    embeds: createLifecycleEmbeds(member, messageSettings, memberCount),
    allowedMentions: { users: [member.id], parse: [] }
  });
}

module.exports = { replacePlaceholders, createLifecycleEmbeds, sendLifecycleMessage };
