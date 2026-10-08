const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  StringSelectMenuBuilder
} = require('discord.js');
const { deflateSync } = require('node:zlib');
const { getGuildSettings } = require('../utils/guildSettings');
const { randomBytes, randomInt } = require('node:crypto');
const { panel } = require('../utils/theme');
const challenges = new Map();
const failures = new Map();

const CODE_ALPHABET = '23456789';
const VERIFY_BUTTON_ID = 'verify:start';
const VERIFY_SELECT_PREFIX = 'verify:select:';
const SEGMENTS = {
  2: ['a', 'b', 'g', 'e', 'd'],
  3: ['a', 'b', 'g', 'c', 'd'],
  4: ['f', 'g', 'b', 'c'],
  5: ['a', 'f', 'g', 'c', 'd'],
  6: ['a', 'f', 'g', 'e', 'c', 'd'],
  7: ['a', 'b', 'c'],
  8: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  9: ['a', 'b', 'c', 'd', 'f', 'g']
};
const SEGMENT_RECTS = {
  a: [6, 0, 24, 5], b: [31, 6, 5, 20], c: [31, 33, 5, 20],
  d: [6, 54, 24, 5], e: [0, 33, 5, 20], f: [0, 6, 5, 20], g: [6, 27, 24, 5]
};

function createCode(length = 6) {
  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code.slice(0, 3) + ' ' + code.slice(3);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  typeBuffer.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return result;
}

function createCaptchaImage(code) {
  const width = 380;
  const height = 110;
  const pixels = Buffer.alloc(width * height * 4);
  const setPixel = (x, y, color) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const offset = (y * width + x) * 4;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = 255;
  };
  const rect = (x, y, w, h, color) => {
    for (let py = y; py < y + h; py += 1) {
      for (let px = x; px < x + w; px += 1) setPixel(px, py, color);
    }
  };

  rect(0, 0, width, height, [32, 34, 39]);
  for (let line = 0; line < 8; line += 1) {
    const startX = Math.floor(Math.random() * width);
    const startY = Math.floor(Math.random() * height);
    const endX = Math.floor(Math.random() * width);
    const endY = Math.floor(Math.random() * height);
    const steps = Math.max(Math.abs(endX - startX), Math.abs(endY - startY));
    for (let step = 0; step <= steps; step += 1) {
      const x = Math.round(startX + (endX - startX) * step / Math.max(steps, 1));
      const y = Math.round(startY + (endY - startY) * step / Math.max(steps, 1));
      setPixel(x, y, [77, 83, 150]);
    }
  }

  const digits = code.replace(/ /g, '').split('');
  const totalWidth = digits.length * 36 + (digits.length - 1) * 12;
  let originX = Math.floor((width - totalWidth) / 2);
  for (const digit of digits) {
    for (const segment of SEGMENTS[digit]) {
      const [x, y, w, h] = SEGMENT_RECTS[segment];
      rect(originX + x, 25 + y, w, h, [245, 246, 250]);
    }
    originX += 48;
  }

  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    scanlines[rowStart] = 0;
    pixels.copy(scanlines, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
  return new AttachmentBuilder(png, { name: 'novora-captcha.png' });
}

function createPanelEmbed(guild, settings, allSettings = {}) {
  return panel(guild, allSettings, { color: settings.color, title: settings.title || '✅ Verifizierung',
    description: `${settings.description || 'Bitte verifiziere dich mit dem Button, um mit dem Server interagieren zu können.'}\n\n────────────────────────\n\n🛡️ Tippe unten auf **Verifizieren** und löse anschließend das Captcha.`,
    imageUrl: settings.imageUrl, thumbnailUrl: settings.thumbnailUrl, footerText: settings.footerText,
    footerImageUrl: settings.footerImageUrl });
}

function createVerifyButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(VERIFY_BUTTON_ID).setLabel('Verifizieren').setEmoji('✅').setStyle(ButtonStyle.Success)
  );
}

function createCaptchaEmbed(guild, allSettings = {}) {
  return panel(guild, allSettings, { title: '🔐 Bitte bestätige, dass du ein Mensch bist',
    description: 'Lies den Code im Bild und wähle unten genau die passende Option aus.\n\n────────────────────────',
    imageUrl: 'attachment://novora-captcha.png' });
}

function stateEmbeds(guild, settings, title, description, color) {
  return panel(guild, settings, { title, description, color });
}
function alreadyVerified(member, roleId) { return Boolean(roleId && member?.roles?.cache?.has(roleId)); }

function createCaptchaOptions(expectedCode) {
  const options = new Set([expectedCode]);
  while (options.size < 5) options.add(createCode());
  return [...options].sort(() => Math.random() - 0.5).map((code) => ({ label: code, value: code }));
}

function createCaptchaSelect(expectedCode, token = randomBytes(12).toString('hex')) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(VERIFY_SELECT_PREFIX + token)
      .setPlaceholder('Waehle den Captcha-Code aus')
      .addOptions(createCaptchaOptions(expectedCode))
  );
}

async function handleVerifyButton(interaction) {
  if (interaction.customId !== VERIFY_BUTTON_ID) return false;
  const settings = await getGuildSettings(interaction.guildId);
  if (!settings.verify?.enabled || !settings.verify.roleId) {
    await interaction.reply({ embeds: stateEmbeds(interaction.guild, settings, '⚠️ Verify ist noch nicht bereit',
      'Die Serververwaltung muss zuerst einen Verify-Kanal und eine Verify-Rolle auswählen und das Panel aktivieren.', 0xF0B232), ephemeral: true });
    return true;
  }
  let member = interaction.member;
  if (!member?.roles?.cache) member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (alreadyVerified(member, settings.verify.roleId)) {
    await interaction.reply({ embeds: stateEmbeds(interaction.guild, settings, '❌ Du bist bereits verifiziert!',
      'Du hast die Verify-Rolle bereits und musst diesen Schritt nicht erneut ausführen.', 0xED4245), ephemeral: true });
    return true;
  }
  const failKey = `${interaction.guildId}:${interaction.user.id}`;
  const record = failures.get(failKey);
  if (record?.count >= 3 && record.until > Date.now()) {
    await interaction.reply({ embeds: stateEmbeds(interaction.guild, settings, '⏳ Bitte kurz warten',
      'Zu viele fehlgeschlagene Versuche. Du kannst es in fünf Minuten erneut versuchen.', 0xF0B232), ephemeral: true }); return true;
  }
  for (const [key, value] of challenges) if (value.expires < Date.now()) challenges.delete(key);
  const code = createCode();
  const token = randomBytes(12).toString('hex');
  challenges.set(token, { code, userId: interaction.user.id, guildId: interaction.guildId, expires: Date.now() + 5 * 60_000 });
  await interaction.reply({
    embeds: createCaptchaEmbed(interaction.guild, settings),
    files: [createCaptchaImage(code)],
    components: [createCaptchaSelect(code, token)],
    ephemeral: true
  });
  return true;
}

async function handleVerifySelect(interaction) {
  if (!interaction.customId.startsWith(VERIFY_SELECT_PREFIX)) return false;
  const token = interaction.customId.slice(VERIFY_SELECT_PREFIX.length);
  const challenge = challenges.get(token);
  challenges.delete(token);
  if (!challenge || challenge.userId !== interaction.user.id || challenge.guildId !== interaction.guildId || challenge.expires < Date.now()) {
    const settings = await getGuildSettings(interaction.guildId);
    await interaction.update({ content: '', embeds: stateEmbeds(interaction.guild, settings, '⌛ Captcha abgelaufen',
      'Starte die Verifizierung erneut und wähle den neuen Code aus.', 0xF0B232), components: [createVerifyButton()] });
    return true;
  }
  const expectedCode = challenge.code;
  const selectedCode = interaction.values[0];

  if (selectedCode !== expectedCode) {
    const settings = await getGuildSettings(interaction.guildId);
    const action = settings.verify?.failureAction || 'retry';
    const failKey = `${interaction.guildId}:${interaction.user.id}`;
    const current = failures.get(failKey);
    const attempts = current?.until > Date.now() ? current.count + 1 : 1;
    failures.set(failKey, { count: attempts, until: Date.now() + 5 * 60_000 });
    const description = action === 'kick' ? 'Der Captcha-Code war falsch. Du wirst vom Server entfernt.' : action === 'timeout'
      ? 'Der Captcha-Code war falsch. Du kannst es später erneut versuchen.'
      : attempts >= 3 ? 'Der Captcha-Code war dreimal falsch. Bitte versuche es in fünf Minuten erneut.'
        : 'Der Captcha-Code war falsch. Starte erneut und wähle den passenden Code aus.';
    await interaction.update({ content: '', embeds: stateEmbeds(interaction.guild, settings, '❌ Captcha nicht korrekt', description, 0xED4245),
      components: action === 'retry' && attempts < 3 ? [createVerifyButton()] : [] });
    if (action === 'retry') return true;
    setTimeout(async () => {
      try {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (action === 'kick' && interaction.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) await member.kick('Captcha falsch gelöst.');
        if (action === 'timeout' && interaction.guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers)) await member.timeout(5 * 60_000, 'Captcha falsch gelöst.');
      } catch (error) {
        // Die Fehlermeldung wurde bereits angezeigt; Kick-Rechte koennen trotzdem fehlen.
      }
    }, 5000);
    return true;
  }

  const settings = await getGuildSettings(interaction.guildId);
  failures.delete(`${interaction.guildId}:${interaction.user.id}`);
  const verifySettings = settings.verify || {};
  // Component interactions can contain either a full GuildMember or only a
  // partial API object. Fetch explicitly before touching the role manager.
  const member = interaction.guild.members.cache.get(interaction.user.id)
    || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member?.roles?.cache) {
    await interaction.update({ content: '', embeds: stateEmbeds(interaction.guild, settings, '⚠️ Mitglied konnte nicht geladen werden',
      'Bitte starte die Verifizierung erneut. Falls der Fehler bleibt, informiere das Team.', 0xED4245), components: [] });
    return true;
  }
  const role = await interaction.guild.roles.fetch(verifySettings.roleId).catch(() => null);
  if (!role || !interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles) || role.position >= interaction.guild.members.me.roles.highest.position) {
    await interaction.update({ content: '', embeds: stateEmbeds(interaction.guild, settings, '⚠️ Rolle konnte nicht vergeben werden',
      'Novora benötigt **Rollen verwalten** und seine Bot-Rolle muss in den Servereinstellungen über der Verify-Rolle stehen.', 0xED4245), components: [] });
    return true;
  }
  try {
    await member.roles.add(verifySettings.roleId, 'Verify erfolgreich abgeschlossen.');
  } catch {
    await interaction.update({ content: '', embeds: stateEmbeds(interaction.guild, settings, '⚠️ Rolle konnte nicht vergeben werden',
      'Prüfe die Rollenrechte und die Reihenfolge der Bot- und Verify-Rollen.', 0xED4245), components: [] });
    return true;
  }
  let removalWarning = '';
  if (verifySettings.removeRoleId && member.roles.cache.has(verifySettings.removeRoleId)) {
    try { await member.roles.remove(verifySettings.removeRoleId, 'Verify erfolgreich abgeschlossen.'); }
    catch { removalWarning = '\n\nDie alte Rolle konnte nicht automatisch entfernt werden. Bitte informiere das Team.'; }
  }
  await interaction.update({ content: '', embeds: stateEmbeds(interaction.guild, settings, '✅ Verifizierung erfolgreich!',
    `Die Verify-Rolle wurde vergeben. Du kannst jetzt mit dem Server interagieren.${removalWarning}`, 0x57F287), components: [] });
  return true;
}

module.exports = {
  VERIFY_BUTTON_ID,
  createPanelEmbed,
  createVerifyButton,
  createCaptchaImage,
  createCaptchaEmbed,
  createCaptchaOptions,
  createCaptchaSelect,
  stateEmbeds,
  alreadyVerified,
  handleVerifyButton,
  handleVerifySelect
};
