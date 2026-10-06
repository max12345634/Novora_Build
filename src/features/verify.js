const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder
} = require('discord.js');
const { getGuildSettings } = require('../utils/guildSettings');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const VERIFY_BUTTON_ID = 'verify:start';
const VERIFY_SELECT_PREFIX = 'verify:select:';

function createCode(length = 6) {
  let code = '';

  for (let index = 0; index < length; index += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }

  return `${code.slice(0, 4)} ${code.slice(4)}`;
}

function createPanelEmbed(guild, settings) {
  const embed = new EmbedBuilder()
    .setColor(settings.color || 0x5865f2)
    .setTitle(settings.title || 'Server Verifizierung')
    .setDescription(settings.description || 'Bitte verifiziere dich mit Hilfe des unteren Buttons, um mit dem Server interagieren zu koennen.')
    .setFooter({ text: settings.footerText || guild.name });

  if (settings.imageUrl) {
    embed.setImage(settings.imageUrl);
  }

  return embed;
}

function createVerifyButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(VERIFY_BUTTON_ID)
      .setLabel('Verifizieren')
      .setStyle(ButtonStyle.Primary)
  );
}

function createCaptchaEmbed(code) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Bitte bestaetige, dass du ein Mensch bist')
    .setDescription([
      'Um zu ueberpruefen, dass du kein Roboter bist, loese bitte dieses Captcha, um vollen Zugriff auf den Server zu erhalten.',
      'Waehle dazu eine der Optionen im unteren Menue aus.',
      '',
      `Captcha-Code: **${code}**`
    ].join('\n'));
}

function createCaptchaOptions(expectedCode) {
  const options = new Set([expectedCode]);

  while (options.size < 5) {
    options.add(createCode());
  }

  return [...options]
    .sort(() => Math.random() - 0.5)
    .map((code) => ({ label: code, value: code }));
}

function createCaptchaSelect(expectedCode) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${VERIFY_SELECT_PREFIX}${Buffer.from(expectedCode).toString('base64url')}`)
      .setPlaceholder('Waehle den Captcha-Code aus')
      .addOptions(createCaptchaOptions(expectedCode))
  );
}

async function handleVerifyButton(interaction) {
  if (interaction.customId !== VERIFY_BUTTON_ID) {
    return false;
  }

  const settings = await getGuildSettings(interaction.guildId);

  if (!settings.verify?.enabled || !settings.verify.roleId) {
    await interaction.reply({
      content: 'Verify ist auf diesem Server noch nicht fertig eingerichtet.',
      ephemeral: true
    });
    return true;
  }

  const code = createCode();

  await interaction.reply({
    embeds: [createCaptchaEmbed(code)],
    components: [createCaptchaSelect(code)],
    ephemeral: true
  });

  return true;
}

async function handleVerifySelect(interaction) {
  if (!interaction.customId.startsWith(VERIFY_SELECT_PREFIX)) {
    return false;
  }

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
        // Der Fehler wird absichtlich nicht an den Nutzer gesendet, weil die ephemere Antwort schon steht.
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

  await interaction.update({
    content: 'Verifizierung erfolgreich',
    embeds: [],
    components: []
  });

  return true;
}

module.exports = {
  VERIFY_BUTTON_ID,
  createPanelEmbed,
  createVerifyButton,
  handleVerifyButton,
  handleVerifySelect
};
