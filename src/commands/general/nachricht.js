const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { getGuildSettings } = require('../../utils/guildSettings');
const { panel } = require('../../utils/theme');
const { resolveImageAttachments } = require('../../utils/imageAttachments');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nachricht')
    .setDescription('Sendet eine frei gestaltete Embed-Nachricht.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addChannelOption((option) => option.setName('kanal').setDescription('Kanal, in den die Nachricht geht.').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption((option) => option.setName('text').setDescription('Text im Embed.').setRequired(true).setMaxLength(4096))
    .addStringOption((option) => option.setName('titel').setDescription('Optionaler Titel.').setMaxLength(256))
    .addAttachmentOption((option) => option.setName('bild').setDescription('Optionales großes Bild aus Fotos/Galerie.'))
    .addAttachmentOption((option) => option.setName('miniatur').setDescription('Optionales kleines Bild aus Fotos/Galerie.'))
    .addStringOption((option) => option.setName('farbe').setDescription('Farbe als Hex, z. B. #5865F2.')),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const channel = interaction.options.getChannel('kanal', true);
      const settings = await getGuildSettings(interaction.guildId);
      const { files, sources } = await resolveImageAttachments(interaction, ['bild', 'miniatur']);
      const embeds = panel(interaction.guild, settings, {
        title: interaction.options.getString('titel') || settings.branding?.projectName || interaction.guild.name,
        description: interaction.options.getString('text', true),
        imageUrl: sources.bild,
        thumbnailUrl: sources.miniatur,
        color: interaction.options.getString('farbe') || settings.branding?.accentColor
      });
      await channel.send({ embeds, files, allowedMentions: { parse: [] } });
      await interaction.editReply({ content: 'Nachricht wurde in ' + channel + ' gesendet. Das gemeinsame Bot-Design wurde übernommen.' });
    } catch (error) {
      await interaction.editReply({ content: error.message?.slice(0, 200) || 'Die Nachricht konnte nicht gesendet werden.' });
    }
  }
};
