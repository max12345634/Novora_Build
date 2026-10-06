const { ChannelType, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { getGuildSettings } = require('../../utils/guildSettings');
const { validHttpUrl } = require('../../features/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('news')
    .setDescription('Sendet eine gestaltete Ankuendigung in den eingerichteten Kanal.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((option) => option.setName('titel').setDescription('Titel der Ankuendigung.').setRequired(true).setMaxLength(256))
    .addStringOption((option) => option.setName('text').setDescription('Nachrichtentext.').setRequired(true).setMaxLength(4000))
    .addStringOption((option) => option.setName('bild').setDescription('Optionales grosses Bild als URL.').setMaxLength(512))
    .addStringOption((option) => option.setName('miniatur').setDescription('Optionales kleines Bild als URL.').setMaxLength(512)),
  async execute(interaction) {
    const settings = (await getGuildSettings(interaction.guildId)).news;
    if (!settings?.enabled || !settings.channelId) {
      await interaction.reply({ content: 'News sind noch nicht eingerichtet. Nutze zuerst /setup news.', ephemeral: true });
      return;
    }
    const channel = await interaction.guild.channels.fetch(settings.channelId).catch(() => null);
    if (!channel?.isTextBased() || channel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: 'Der gespeicherte News-Kanal ist nicht mehr verfuegbar. Richte /setup news erneut ein.', ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(interaction.options.getString('titel', true))
      .setDescription(interaction.options.getString('text', true))
      .setFooter({ text: interaction.guild.name });
    const image = validHttpUrl(interaction.options.getString('bild'));
    const thumbnail = validHttpUrl(interaction.options.getString('miniatur'));
    if (image) embed.setImage(image);
    if (thumbnail) embed.setThumbnail(thumbnail);

    await channel.send({
      content: settings.roleId ? '<@&' + settings.roleId + '>' : undefined,
      embeds: [embed],
      allowedMentions: settings.roleId ? { roles: [settings.roleId], parse: [] } : { parse: [] }
    });
    await interaction.reply({ content: 'Ankuendigung wurde in ' + channel + ' gesendet.', ephemeral: true });
  }
};
