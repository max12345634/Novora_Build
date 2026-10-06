const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { makeEmbeds, validHttpUrl } = require('../../features/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nachricht')
    .setDescription('Sendet eine frei gestaltete Embed-Nachricht.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addChannelOption((option) => option.setName('kanal').setDescription('Kanal, in den die Nachricht geht.').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption((option) => option.setName('titel').setDescription('Optionaler Titel.').setMaxLength(256))
    .addStringOption((option) => option.setName('text').setDescription('Text im Embed.').setRequired(true).setMaxLength(4096))
    .addStringOption((option) => option.setName('bild').setDescription('Optionales grosses Bild als URL.').setMaxLength(512))
    .addStringOption((option) => option.setName('miniatur').setDescription('Optionales kleines Bild als URL.').setMaxLength(512))
    .addStringOption((option) => option.setName('footer').setDescription('Optionaler Footer-Text.').setMaxLength(2048))
    .addStringOption((option) => option.setName('footerbild').setDescription('Optionales Banner unter dem Embed.').setMaxLength(512))
    .addStringOption((option) => option.setName('farbe').setDescription('Farbe als Hex, z. B. #5865F2.')),
  async execute(interaction) {
    const channel = interaction.options.getChannel('kanal', true);
    const imageUrl = interaction.options.getString('bild');
    const thumbnailUrl = interaction.options.getString('miniatur');
    const footerImageUrl = interaction.options.getString('footerbild');
    if ([imageUrl, thumbnailUrl, footerImageUrl].some((url) => url && !validHttpUrl(url))) {
      await interaction.reply({ content: 'Ein Bild-Link ist ungueltig. Nutze einen direkten HTTP- oder HTTPS-Bildlink.', ephemeral: true });
      return;
    }
    const embeds = makeEmbeds({
      title: interaction.options.getString('titel'),
      description: interaction.options.getString('text', true),
      imageUrl,
      thumbnailUrl,
      footerImageUrl,
      footerText: interaction.options.getString('footer') || interaction.guild.name,
      color: interaction.options.getString('farbe')
    });
    await channel.send({ embeds, allowedMentions: { parse: [] } });
    await interaction.reply({ content: 'Nachricht wurde in ' + channel + ' gesendet.', ephemeral: true });
  }
};
