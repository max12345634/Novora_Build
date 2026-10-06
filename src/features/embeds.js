const { EmbedBuilder } = require('discord.js');

function validHttpUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseColor(value, fallback = 0x5865f2) {
  const normalized = String(value || '').replace(/^#/, '');
  return /^[0-9a-fA-F]{6}$/.test(normalized) ? Number.parseInt(normalized, 16) : fallback;
}

function makeEmbeds(settings) {
  const embed = new EmbedBuilder()
    .setColor(parseColor(settings.color))
    .setDescription(settings.description);
  if (settings.title) embed.setTitle(settings.title);
  if (settings.footerText) embed.setFooter({ text: settings.footerText });
  const image = validHttpUrl(settings.imageUrl);
  const thumbnail = validHttpUrl(settings.thumbnailUrl);
  if (image) embed.setImage(image);
  if (thumbnail) embed.setThumbnail(thumbnail);
  const embeds = [embed];
  const footerImage = validHttpUrl(settings.footerImageUrl);
  if (footerImage) embeds.push(new EmbedBuilder().setImage(footerImage));
  return embeds;
}

module.exports = { makeEmbeds, parseColor, validHttpUrl };
