const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { baseEmbed, homeComponents } = require('../../features/setup');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Öffnet das zentrale Novora-Setup für diesen Server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  async execute(interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: 'Dieser Command funktioniert nur auf einem Discord-Server.', ephemeral: true });
      return;
    }
    const settings = await getGuildSettings(interaction.guildId);
    await interaction.reply({ embeds: [baseEmbed(interaction.guild, settings)], components: homeComponents(), ephemeral: true });
  }
};
