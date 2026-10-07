const { EmbedBuilder } = require('discord.js');
const { parseColor, validHttpUrl } = require('../features/embeds');
function panel(guild, settings, { title, description, imageUrl, thumbnailUrl, footerImageUrl, color, fields = [] }) {
  const brand = settings.branding || {};
  const project = brand.projectName || guild.name;
  const embed = new EmbedBuilder()
    .setColor(parseColor(color || brand.primaryColor, 0x5865f2))
    .setTitle(String(title || project).slice(0, 256))
    .setDescription(String(description || ' ').slice(0, 4096))
    .setFooter({ text: String(brand.footerText || project).slice(0, 2048), iconURL: validHttpUrl(brand.logoUrl) || undefined });
  for (const field of fields.slice(0, 25)) embed.addFields({ name: String(field.name).slice(0, 256), value: String(field.value).slice(0, 1024), inline: Boolean(field.inline) });
  const image = validHttpUrl(imageUrl || brand.panelBannerUrl || brand.defaultImageUrl);
  const thumb = validHttpUrl(thumbnailUrl || brand.thumbnailUrl || brand.logoUrl);
  if (image) embed.setImage(image);
  if (thumb) embed.setThumbnail(thumb);
  const result = [embed];
  const footer = validHttpUrl(footerImageUrl || brand.footerImageUrl);
  if (footer) result.push(new EmbedBuilder().setImage(footer));
  return result;
}
module.exports = { panel };
