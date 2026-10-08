const fs = require('node:fs/promises');
const path = require('node:path');

const EMOJI_NAMES = [
  'ticket', 'case', 'tag', 'user', 'team', 'clock', 'calendar', 'logs', 'transcript', 'rating', 'lock',
  'verify', 'channel', 'voice', 'application', 'welcome', 'leave', 'ai', 'warning', 'role', 'settings',
  'check', 'close', 'announcement', 'report', 'bot', 'folder'
];
const ALIASES = new Map([
  ['🎫', 'ticket'], ['🧾', 'case'], ['🏷️', 'tag'], ['🏷', 'tag'], ['👤', 'user'], ['👥', 'team'],
  ['🕒', 'clock'], ['⏰', 'clock'], ['⏱️', 'clock'], ['⏱', 'clock'], ['📅', 'calendar'], ['🗓️', 'calendar'],
  ['📋', 'logs'], ['📄', 'transcript'], ['📝', 'application'], ['⭐', 'rating'], ['🔒', 'lock'], ['🔐', 'lock'],
  ['🛡️', 'verify'], ['🛡', 'verify'], ['💬', 'channel'], ['🎙️', 'voice'], ['🎙', 'voice'], ['👋', 'welcome'],
  ['🚪', 'leave'], ['🤖', 'ai'], ['⚠️', 'warning'], ['⚠', 'warning'], ['⚙️', 'settings'], ['⚙', 'settings'],
  ['✅', 'check'], ['❌', 'close'], ['📢', 'announcement'], ['🚩', 'report'], ['📁', 'folder']
]);

function manager(client) { return client?.application?.emojis; }
function getApplicationEmoji(client, name) {
  return manager(client)?.cache?.find(emoji => emoji.name === `novora_${name}`) || null;
}
function emojiMarkup(client, name, fallback = '') {
  const emoji = getApplicationEmoji(client, name);
  return emoji ? `<:${emoji.name}:${emoji.id}>` : fallback;
}
function emojiOption(client, name, fallback) {
  const emoji = getApplicationEmoji(client, name);
  return emoji ? { id: emoji.id, name: emoji.name } : fallback;
}
function emojiForSymbol(client, symbol, fallback = symbol) {
  return emojiOption(client, ALIASES.get(symbol) || 'ticket', fallback);
}
function replaceEmojiText(client, input) {
  let text = String(input ?? '');
  for (const [symbol, name] of ALIASES) {
    const emoji = getApplicationEmoji(client, name);
    if (emoji) text = text.split(symbol).join(`<:${emoji.name}:${emoji.id}>`);
  }
  return text;
}
function ownerIds(client) {
  const owner = client?.application?.owner;
  return new Set([owner?.id, owner?.ownerId, owner?.owner?.id].filter(Boolean));
}
function isEmojiAdmin(client, userId) {
  const configured = String(process.env.NOVORA_EMOJI_ADMIN_IDS || '').split(',').map(value => value.trim()).filter(Boolean);
  return ownerIds(client).has(userId) || configured.includes(userId);
}

async function loadApplicationEmojis(client) {
  if (!manager(client)) throw new Error('Discord hat den Bot-Anwendungsbereich nicht geladen.');
  if (typeof client.application.fetch === 'function') await client.application.fetch();
  return manager(client).fetch();
}

async function installApplicationEmojis(client, userId) {
  if (!isEmojiAdmin(client, userId)) throw new Error('Nur der Besitzer der Novora-Anwendung darf das gemeinsame Emoji-Set installieren.');
  const emojis = await loadApplicationEmojis(client);
  const directory = path.resolve(__dirname, '../../assets/emojis');
  let created = 0, existing = 0;
  for (const name of EMOJI_NAMES) {
    if (emojis.some(emoji => emoji.name === `novora_${name}`)) { existing += 1; continue; }
    const image = await fs.readFile(path.join(directory, `${name}.png`));
    if (image.length > 256 * 1024) throw new Error(`Das Emoji ${name} ist größer als Discords Grenze von 256 KiB.`);
    const emoji = await manager(client).create({ name: `novora_${name}`, attachment: image });
    emojis.set(emoji.id, emoji);
    created += 1;
  }
  return { created, existing, total: emojis.size };
}

module.exports = { EMOJI_NAMES, getApplicationEmoji, emojiMarkup, emojiOption, replaceEmojiText,
  emojiForSymbol, isEmojiAdmin, loadApplicationEmojis, installApplicationEmojis };
