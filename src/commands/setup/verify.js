const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { createPanelEmbed, createVerifyButton } = require('../../features/verify');
const { updateGuildSettings } = require('../../utils/guildSettings');

function addMessageOptions(subcommand) {
  return subcommand
    .addChannelOption((option) => option.setName('kanal').setDescription('Kanal fuer diese Nachricht.').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption((option) => option.setName('titel').setDescription('Titel des Embeds.').setMaxLength(256))
    .addStringOption((option) => option.setName('text').setDescription('Text des Embeds.').setMaxLength(4096))
    .addStringOption((option) => option.setName('bild').setDescription('Grosse Bild-URL.').setMaxLength(512))
    .addStringOption((option) => option.setName('miniatur').setDescription('Kleine Bild-URL oben rechts.').setMaxLength(512))
    .addStringOption((option) => option.setName('footer').setDescription('Kleiner Text unten.').setMaxLength(2048))
    .addStringOption((option) => option.setName('footerbild').setDescription('Optionales Banner unter dem Embed.').setMaxLength(512))
    .addStringOption((option) => option.setName('farbe').setDescription('Hex-Farbe, z. B. #5865F2.'));
}

function readMessageSettings(interaction, fallbackTitle, fallbackText) {
  const colorInput = interaction.options.getString('farbe')?.replace(/^#/, '');
  const color = colorInput && /^[0-9a-fA-F]{6}$/.test(colorInput) ? Number.parseInt(colorInput, 16) : 0x5865f2;
  return {
    enabled: true,
    channelId: interaction.options.getChannel('kanal', true).id,
    title: interaction.options.getString('titel') || fallbackTitle,
    description: interaction.options.getString('text') || fallbackText,
    imageUrl: interaction.options.getString('bild') || null,
    thumbnailUrl: interaction.options.getString('miniatur') || null,
    footerText: interaction.options.getString('footer') || interaction.guild.name,
    footerImageUrl: interaction.options.getString('footerbild') || null,
    color
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Richtet Novora-Systeme fuer diesen Server ein.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) => subcommand
      .setName('verify')
      .setDescription('Richtet das Verify Panel fuer den Server ein.')
      .addChannelOption((option) => option.setName('kanal').setDescription('Kanal fuer das Verify Panel.').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addRoleOption((option) => option.setName('rolle').setDescription('Rolle nach erfolgreicher Verifizierung.').setRequired(true))
      .addRoleOption((option) => option.setName('entfernen').setDescription('Optionale Rolle, die danach entfernt wird.'))
      .addStringOption((option) => option.setName('bild').setDescription('Optionale Bild-URL fuer das Panel.').setMaxLength(512))
      .addStringOption((option) => option.setName('farbe').setDescription('Embed-Farbe als Hex, z. B. #5865F2.')))
    .addSubcommand((subcommand) => addMessageOptions(subcommand.setName('welcome').setDescription('Richtet die Willkommensnachricht ein.')))
    .addSubcommand((subcommand) => addMessageOptions(subcommand.setName('leave').setDescription('Richtet die Leave-Nachricht ein.')))
    .addSubcommand((subcommand) => subcommand
      .setName('news')
      .setDescription('Legt den Zielkanal und die optionale Ping-Rolle fuer /news fest.')
      .addChannelOption((option) => option.setName('kanal').setDescription('Zielkanal fuer Ankuendigungen.').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addRoleOption((option) => option.setName('rolle').setDescription('Optionale Rolle, die bei News benachrichtigt wird.'))),
  async execute(interaction) {
    const mode = interaction.options.getSubcommand();

    if (mode === 'news') {
      const channel = interaction.options.getChannel('kanal', true);
      const role = interaction.options.getRole('rolle');
      await updateGuildSettings(interaction.guildId, { news: { enabled: true, channelId: channel.id, roleId: role?.id || null } });
      await interaction.reply({ content: 'News werden ab jetzt in ' + channel + ' gesendet.', ephemeral: true });
      return;
    }

    if (mode === 'verify') {
      const channel = interaction.options.getChannel('kanal', true);
      const role = interaction.options.getRole('rolle', true);
      const removeRole = interaction.options.getRole('entfernen');
      const imageUrl = interaction.options.getString('bild');
      const colorInput = interaction.options.getString('farbe')?.replace(/^#/, '');
      const verifySettings = {
        enabled: true,
        channelId: channel.id,
        roleId: role.id,
        removeRoleId: removeRole?.id || null,
        imageUrl: imageUrl || null,
        color: colorInput && /^[0-9a-fA-F]{6}$/.test(colorInput) ? Number.parseInt(colorInput, 16) : 0x5865f2,
        title: 'Server Verifizierung',
        description: 'Bitte verifiziere dich mit Hilfe des unteren Buttons, um mit dem Server zu interagieren.',
        footerText: interaction.guild.name
      };
      await updateGuildSettings(interaction.guildId, { verify: verifySettings });
      await channel.send({ embeds: [createPanelEmbed(interaction.guild, verifySettings)], components: [createVerifyButton()], allowedMentions: { parse: [] } });
      await interaction.reply({ content: 'Verify Panel wurde in ' + channel + ' erstellt.', ephemeral: true });
      return;
    }

    const key = mode === 'welcome' ? 'welcome' : 'leave';
    const defaults = mode === 'welcome'
      ? ['Willkommen bei %SERVERNAME%', 'Hey %MENTION%, schoen, dass du da bist! Du bist Mitglied Nummer %TOTALUSERCOUNT%. Viel Spass auf %SERVERNAME%.']
      : ['Auf Wiedersehen', '%USERNAME% hat den Server verlassen. Wir wuenschen dir alles Gute!'];
    const settings = readMessageSettings(interaction, defaults[0], defaults[1]);
    await updateGuildSettings(interaction.guildId, { [key]: settings });
    await interaction.reply({
      content: (mode === 'welcome' ? 'Willkommens' : 'Leave') + '-Nachricht wurde fuer ' + interaction.options.getChannel('kanal', true) + ' gespeichert.',
      ephemeral: true
    });
  }
};
