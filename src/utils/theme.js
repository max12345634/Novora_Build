const { EmbedBuilder } = require('discord.js');
const { parseColor, validHttpUrl } = require('../features/embeds');
const imageSource = (value) => validHttpUrl(value) || (typeof value === 'string' && /^attachment:\/\/[a-z0-9_.-]{1,100}$/i.test(value) ? value : null);
function panel(guild, settings, { title, description, imageUrl, thumbnailUrl, color, fields = [] }) {
  const brand = settings.branding || {};
  const project = brand.projectName || guild.name;
  const sharedFooterText = String(brand.footerText || project).slice(0, 2048);
  const embed = new EmbedBuilder()
    .setColor(parseColor(color || brand.primaryColor, 0x5865f2))
    .setTitle(String(title || project).slice(0, 256))
    .setDescription(String(description || ' ').slice(0, 4096))
    .setFooter({ text: sharedFooterText, iconURL: validHttpUrl(brand.logoUrl) || undefined });
  let remaining = 5800 - String(title || project).length - String(description || ' ').slice(0, 4096).length - sharedFooterText.length;
  for (const field of fields.slice(0, 25)) {
    const name = String(field.name).slice(0, 256);
    if (remaining < name.length + 2) break;
    const value = String(field.value).slice(0, Math.min(1024, remaining - name.length));
    if (!value) break;
    embed.addFields({ name, value, inline: Boolean(field.inline) });
    remaining -= name.length + value.length;
  }
  const image = imageSource(imageUrl || brand.panelBannerUrl || brand.defaultImageUrl);
  const thumb = imageSource(thumbnailUrl || brand.thumbnailUrl || brand.logoUrl);
  if (image) embed.setImage(image);
  if (thumb) embed.setThumbnail(thumb);
  const result = [embed];
  // Footer ist ausschließlich Teil des zentralen Server-Brandings, damit jedes Panel gleich bleibt.
  const footer = imageSource(brand.footerImageUrl);
  if (footer) result.push(new EmbedBuilder().setImage(footer));
  return result;
}
module.exports = { panel };
