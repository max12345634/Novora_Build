const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder
} = require('discord.js');
const { deflateSync } = require('node:zlib');
const { getGuildSettings } = require('../utils/guildSettings');

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
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
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

function createPanelEmbed(guild, settings) {
  const embed = new EmbedBuilder()
    .setColor(settings.color || 0x5865f2)
    .setTitle(settings.title || 'Server Verifizierung')
    .setDescription(settings.description || 'Bitte verifiziere dich mit Hilfe des unteren Buttons, um mit dem Server zu interagieren.')
    .setFooter({ text: settings.footerText || guild.name });
  if (settings.imageUrl) embed.setImage(settings.imageUrl);
  return embed;
}

function createVerifyButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(VERIFY_BUTTON_ID).setLabel('Verifizieren').setStyle(ButtonStyle.Primary)
  );
}

function createCaptchaEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Bitte bestaetige, dass du ein Mensch bist')
    .setDescription('Lies den Code im Bild und waehle unten die passende Option aus.')
    .setImage('attachment://novora-captcha.png');
}

function createCaptchaOptions(expectedCode) {
  const options = new Set([expectedCode]);
  while (options.size < 5) options.add(createCode());
  return [...options].sort(() => Math.random() - 0.5).map((code) => ({ label: code, value: code }));
}

function createCaptchaSelect(expectedCode) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(VERIFY_SELECT_PREFIX + Buffer.from(expectedCode).toString('base64url'))
      .setPlaceholder('Waehle den Captcha-Code aus')
      .addOptions(createCaptchaOptions(expectedCode))
  );
}

async function handleVerifyButton(interaction) {
  if (interaction.customId !== VERIFY_BUTTON_ID) return false;
  const settings = await getGuildSettings(interaction.guildId);
  if (!settings.verify?.enabled || !settings.verify.roleId) {
    await interaction.reply({ content: 'Verify ist auf diesem Server noch nicht fertig eingerichtet.', ephemeral: true });
    return true;
  }
  const code = createCode();
  await interaction.reply({
    embeds: [createCaptchaEmbed()],
    files: [createCaptchaImage(code)],
    components: [createCaptchaSelect(code)],
    ephemeral: true
  });
  return true;
}

async function handleVerifySelect(interaction) {
  if (!interaction.customId.startsWith(VERIFY_SELECT_PREFIX)) return false;
  const expectedCode = Buffer.from(interaction.customId.slice(VERIFY_SELECT_PREFIX.length), 'base64url').toString('utf8');
  const selectedCode = interaction.values[0];

  if (selectedCode !== expectedCode) {
    await interaction.update({
      content: 'Captcha ist fehlgeschlagen. Du hast das Captcha nicht geloest. Du wirst in 5 Sekunden vom Server gekickt.',
      embeds: [],
      components: []
    });
    setTimeout(async () => {
      try {
        if (interaction.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) {
          await interaction.member.kick('Captcha falsch geloest.');
        }
      } catch (error) {
        // Die Fehlermeldung wurde bereits angezeigt; Kick-Rechte koennen trotzdem fehlen.
      }
    }, 5000);
    return true;
  }

  const settings = await getGuildSettings(interaction.guildId);
  const verifySettings = settings.verify || {};
  await interaction.member.roles.add(verifySettings.roleId, 'Verify erfolgreich abgeschlossen.');
  if (verifySettings.removeRoleId && interaction.member.roles.cache.has(verifySettings.removeRoleId)) {
    await interaction.member.roles.remove(verifySettings.removeRoleId, 'Verify erfolgreich abgeschlossen.');
  }
  await interaction.update({ content: 'Verifizierung erfolgreich', embeds: [], components: [] });
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
  handleVerifyButton,
  handleVerifySelect
};
