const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { createPanelEmbed, createVerifyButton } = require('../../features/verify');
const { updateGuildSettings } = require('../../utils/guildSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Richtet Novora Module auf deinem Server ein.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) => subcommand
      .setName('verify')
      .setDescription('Richtet das Verify Panel fuer den Server ein.')
      .addChannelOption((option) => option
        .setName('kanal')
        .setDescription('Kanal, in den das Verify Panel gesendet wird.')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true))
      .addRoleOption((option) => option
        .setName('rolle')
        .setDescription('Rolle, die nach erfolgreicher Verifizierung gegeben wird.')
        .setRequired(true))
      .addRoleOption((option) => option
        .setName('entfernen')
        .setDescription('Optionale Rolle, die nach Verify entfernt wird.'))
      .addStringOption((option) => option
        .setName('bild')
        .setDescription('Optionale Bild-URL fuer das Verify Panel.'))
      .addStringOption((option) => option
        .setName('farbe')
        .setDescription('Embed-Farbe als Hex, z. B. #5865F2.'))),
  async execute(interaction) {
    if (interaction.options.getSubcommand() !== 'verify') {
      await interaction.reply({ content: 'Dieses Setup ist noch nicht verfuegbar.', ephemeral: true });
      return;
    }

    const channel = interaction.options.getChannel('kanal', true);
    const role = interaction.options.getRole('rolle', true);
    const removeRole = interaction.options.getRole('entfernen');
    const imageUrl = interaction.options.getString('bild');
    const colorInput = interaction.options.getString('farbe');
    const color = colorInput?.replace('#', '');

    const verifySettings = {
      enabled: true,
      channelId: channel.id,
      roleId: role.id,
      removeRoleId: removeRole?.id || null,
      imageUrl: imageUrl || null,
      color: color && /^[0-9a-fA-F]{6}$/.test(color) ? Number.parseInt(color, 16) : 0x5865f2,
      title: 'Server Verifizierung',
      description: 'Bitte verifiziere dich mit Hilfe des unteren Buttons, um mit dem Server interagieren zu koennen.',
      footerText: interaction.guild.name
    };

    await updateGuildSettings(interaction.guildId, { verify: verifySettings });

    await channel.send({
      embeds: [createPanelEmbed(interaction.guild, verifySettings)],
      components: [createVerifyButton()]
    });

    await interaction.reply({
      content: `Verify Panel wurde in ${channel} erstellt.`,
      ephemeral: true
    });
  }
};
