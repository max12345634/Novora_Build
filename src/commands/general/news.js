const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { getGuildSettings } = require('../../utils/guildSettings');
const { panel } = require('../../utils/theme');
const { resolveImageAttachments } = require('../../utils/imageAttachments');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('news')
    .setDescription('Sendet eine gestaltete Ankuendigung in den eingerichteten Kanal.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((option) => option.setName('titel').setDescription('Titel der Ankuendigung.').setRequired(true).setMaxLength(256))
    .addStringOption((option) => option.setName('text').setDescription('Nachrichtentext.').setRequired(true).setMaxLength(4000))
    .addAttachmentOption((option) => option.setName('bild').setDescription('Optionales großes Bild aus Fotos/Galerie.'))
    .addAttachmentOption((option) => option.setName('miniatur').setDescription('Optionales kleines Bild aus Fotos/Galerie.')),
  async execute(interaction) {
    const allSettings = await getGuildSettings(interaction.guildId), settings = allSettings.news;
    if (!settings?.enabled || !settings.channelId) {
      await interaction.reply({ content: 'News sind noch nicht eingerichtet. Nutze zuerst /setup news.', ephemeral: true });
      return;
    }
    const channel = await interaction.guild.channels.fetch(settings.channelId).catch(() => null);
    if (!channel?.isTextBased() || channel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: 'Der gespeicherte News-Kanal ist nicht mehr verfuegbar. Richte /setup news erneut ein.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      const { files, sources } = await resolveImageAttachments(interaction, ['bild', 'miniatur']);
      const embeds = panel(interaction.guild, allSettings, {
        title: interaction.options.getString('titel', true),
        description: interaction.options.getString('text', true),
        imageUrl: sources.bild,
        thumbnailUrl: sources.miniatur,
        color: settings.color || allSettings.branding?.accentColor
      });
      await channel.send({
        content: settings.roleId ? '<@&' + settings.roleId + '>' : undefined,
        embeds, files,
        allowedMentions: settings.roleId ? { roles: [settings.roleId], parse: [] } : { parse: [] }
      });
      await interaction.editReply({ content: 'Ankuendigung wurde in ' + channel + ' gesendet. Das gemeinsame Bot-Design wurde übernommen.' });
    } catch (error) {
      await interaction.editReply({ content: error.message?.slice(0, 200) || 'Die Ankündigung konnte nicht gesendet werden.' });
    }
  }
};
