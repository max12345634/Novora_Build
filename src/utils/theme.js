const { EmbedBuilder } = require('discord.js');
const { parseColor, validHttpUrl } = require('../features/embeds');
const { DESIGN_BY_ID } = require('../features/designs');
const imageSource = (value) => validHttpUrl(value) || (typeof value === 'string' && /^attachment:\/\/[a-z0-9_.-]{1,100}$/i.test(value) ? value : null);
function panel(guild, settings, { title, description, imageUrl, thumbnailUrl, color, fields = [] }) {
  const brand = settings.branding || {};
  const design = DESIGN_BY_ID[brand.designId] || null;
  const project = brand.projectName || guild.name;
  const sharedFooterText = String(brand.footerText || project).slice(0, 2048);
  const serverIcon = typeof guild.iconURL === 'function' ? guild.iconURL({ extension: 'png', size: 64 }) : null;
  const embed = new EmbedBuilder()
    .setColor(parseColor(color || brand.primaryColor || design?.primaryColor, 0x5865f2))
    .setAuthor({ name: String(project).slice(0, 256), iconURL: validHttpUrl(brand.logoUrl) || serverIcon || undefined })
    .setTitle(String(title || project).slice(0, 256))
    .setDescription(String(description || ' ').slice(0, 4096))
    .setFooter({ text: sharedFooterText, iconURL: validHttpUrl(brand.logoUrl) || undefined });
  // A consistent project header, accent stripe, compact field spacing and shared graphic footer
  // reproduce the reference hierarchy while keeping every guild's branding configurable.
  let remaining = 5800 - String(project).slice(0, 256).length - String(title || project).slice(0, 256).length
    - String(description || ' ').slice(0, 4096).length - sharedFooterText.length;
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
