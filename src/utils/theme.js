const { EmbedBuilder } = require('discord.js');
const { parseColor, validHttpUrl } = require('../features/embeds');
const { DESIGN_BY_ID } = require('../features/designs');
const { replaceEmojiText } = require('./emojiAssets');
const imageSource = (value) => validHttpUrl(value) || (typeof value === 'string' && /^attachment:\/\/[a-z0-9_.-]{1,100}$/i.test(value) ? value : null);
const SEPARATOR = '────────────────────────';
const DEFAULT_ASSET_BASE_URL = 'https://raw.githubusercontent.com/max12345634/Novora_Build/main/assets/banners';
function defaultBanner(title) {
  const text = String(title || '').toLocaleLowerCase('de-DE');
  if (/verify|verifiz|captcha/.test(text)) return `${DEFAULT_ASSET_BASE_URL}/verify.png`;
  if (/ticket.*(erstellt|opened|geöffnet)|willkommen im .*support|ticket von/.test(text)) return `${DEFAULT_ASSET_BASE_URL}/ticket_open.png`;
  if (/ticket|support/.test(text)) return `${DEFAULT_ASSET_BASE_URL}/ticket.png`;
  if (/bewerb|application/.test(text)) return `${DEFAULT_ASSET_BASE_URL}/application.png`;
  if (/welcome|willkommen|beitritt/.test(text)) return `${DEFAULT_ASSET_BASE_URL}/welcome.png`;
  if (/leave|auf wiedersehen|verlassen/.test(text)) return `${DEFAULT_ASSET_BASE_URL}/leave.png`;
  if (/voice|sprach|warteraum/.test(text)) return `${DEFAULT_ASSET_BASE_URL}/voice.png`;
  if (/log|protokoll|gelöscht|geändert|erstellt von|server geändert|nachricht/.test(text)) return `${DEFAULT_ASSET_BASE_URL}/logs.png`;
  if (/ki|ai|novora.*antwort|antwort.*novora/.test(text)) return `${DEFAULT_ASSET_BASE_URL}/ai.png`;
  return `${DEFAULT_ASSET_BASE_URL}/general.png`;
}
function panel(guild, settings, { title, description, imageUrl, thumbnailUrl, color, fields = [] }) {
  const brand = settings.branding || {};
  const design = DESIGN_BY_ID[brand.designId] || null;
  const project = String(brand.projectName || guild.name);
  const serverLabel = guild.name && guild.name !== project ? `${project} · ${guild.name}` : project;
  const sharedFooterText = String(brand.footerText || project).slice(0, 2048);
  const serverIcon = typeof guild.iconURL === 'function' ? guild.iconURL({ extension: 'png', size: 64 }) : null;
  const body = String(description || ' ').trim();
  const panelDescription = body.endsWith(SEPARATOR) ? body : `${body}\n\n${SEPARATOR}`;
  const titleText = replaceEmojiText(guild.client, String(title || project)).slice(0, 256);
  const descriptionText = replaceEmojiText(guild.client, panelDescription).slice(0, 4096);
  const authorText = serverLabel.slice(0, 256);
  const footerText = replaceEmojiText(guild.client, sharedFooterText).slice(0, 2048);
  const embed = new EmbedBuilder()
    .setColor(parseColor(color || brand.primaryColor || design?.primaryColor, 0x5865f2))
    .setAuthor({ name: authorText, iconURL: validHttpUrl(brand.logoUrl) || serverIcon || undefined })
    .setTitle(titleText)
    .setDescription(descriptionText)
    .setFooter({ text: footerText, iconURL: validHttpUrl(brand.logoUrl) || undefined });
  // A consistent project header, accent stripe, compact field spacing and shared graphic footer
  // reproduce the reference hierarchy while keeping every guild's branding configurable.
  let remaining = 5800 - authorText.length - titleText.length - descriptionText.length - footerText.length;
  for (const field of fields.slice(0, 25)) {
    const name = replaceEmojiText(guild.client, String(field.name)).slice(0, 256);
    if (remaining < name.length + 2) break;
    const value = replaceEmojiText(guild.client, String(field.value)).slice(0, Math.min(1024, remaining - name.length));
    if (!value) break;
    embed.addFields({ name, value, inline: Boolean(field.inline) });
    remaining -= name.length + value.length;
  }
  const image = imageSource(imageUrl || brand.panelBannerUrl || brand.defaultImageUrl || defaultBanner(title));
  const thumb = imageSource(thumbnailUrl || brand.thumbnailUrl || brand.logoUrl);
  if (image) embed.setImage(image);
  if (thumb) embed.setThumbnail(thumb);
  const result = [embed];
  // Footer ist ausschließlich Teil des zentralen Server-Brandings, damit jedes Panel gleich bleibt.
  const footer = imageSource(brand.footerImageUrl || `${DEFAULT_ASSET_BASE_URL}/footer.png`);
  if (footer) result.push(new EmbedBuilder().setImage(footer));
  return result;
}
module.exports = { panel, defaultBanner, DEFAULT_ASSET_BASE_URL };
