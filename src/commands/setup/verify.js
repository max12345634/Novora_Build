const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { baseEmbed, setupMenu } = require('../../features/setup');

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
    await interaction.reply({ embeds: [baseEmbed(interaction.guild)], components: [setupMenu()], ephemeral: true });
  }
};
